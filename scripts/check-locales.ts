import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { en } from "../src/renderer/src/translations/languages/en";

const localeDirectory = path.resolve("src/renderer/src/translations/languages");

function validateLocale(
	locale: unknown,
	english: unknown,
	keyPath: string,
	errors: string[],
): void {
	if (!locale || typeof locale !== "object" || Array.isArray(locale)) {
		errors.push(`${keyPath || "<root>"}: expected an object`);
		return;
	}
	const englishObject = english as Record<string, unknown>;
	for (const [key, value] of Object.entries(locale)) {
		const currentPath = keyPath ? `${keyPath}.${key}` : key;
		if (!(key in englishObject)) {
			errors.push(`${currentPath}: key does not exist in English`);
			continue;
		}
		const expected = englishObject[key];
		if (typeof expected === "string") {
			if (typeof value !== "string") {
				errors.push(`${currentPath}: expected a string`);
			}
		} else {
			validateLocale(value, expected, currentPath, errors);
		}
	}
}

async function main(): Promise<void> {
	const errors: string[] = [];
	const files = fs
		.readdirSync(localeDirectory)
		.filter((file) => file.endsWith(".ts") && file !== "en.ts")
		.sort();

	for (const file of files) {
		const code = path.basename(file, ".ts");
		const module = await import(
			`${pathToFileURL(path.join(localeDirectory, file)).href}?validation=1`
		);
		validateLocale(module[code], en, code, errors);
	}

	if (errors.length > 0) {
		throw new Error(errors.sort().join("\n"));
	}

	console.log(
		`Validated ${files.length} locales; missing English keys use the runtime English fallback.`,
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
