import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { Response } from "express";
import { readConfig } from "../../config";
import { removeValue } from "./dependencies/environment";

export async function deleteScript(name: string, res: Response) {
	try {
		// sanitize name
		const sanitizedName = name.replace(/\s+/g, "-");

		// delete script dirs
		const root = app.isPackaged
			? path.join(path.dirname(app.getPath("exe")))
			: path.join(process.cwd());
		const config = readConfig();
		const appsDir = path.join(config?.defaultInstallFolder || root, "apps");
		const appDir = path.join(appsDir, sanitizedName);
		const dioneFile = path.join(appDir, "dione.json");
		const dioneData = await fs.readFile(dioneFile, "utf-8");
		const dioneJson = JSON.parse(dioneData);
		const needEnv = JSON.stringify(dioneJson).includes("env");
		const envDep = (
			dioneJson.installation as Array<{
				name?: string;
				env?: { name?: string };
			}>
		).find((dep) => dep.env && dep.env.name);
		const envName = envDep?.env?.name;
		const envPath = envName ? path.join(appDir, envName, "Scripts") : undefined;

		// remove environment variable if needed
		if (needEnv && envName && envPath) {
			console.log(`Removing environment variable: ${envName} on ${envPath}`);
			removeValue(envPath, "PATH");
		}

		// check if dir exists
		try {
			await fs.access(appDir);
		} catch (err) {
			res.status(404).send("App not found.");
			return;
		}

		// stop and delete all files
		await closeFile(appDir);
		await fs.rm(appDir, { recursive: true, force: true });
		res.status(200).send("App deleted successfully.");
	} catch (error) {
		console.error("Error deleting app:", error);
		res.status(500).send("Failed to delete app. Please try again.");
	}
}

export async function closeFile(directory: string) {
	try {
		const files = await fs.readdir(directory);
		for (const file of files) {
			const filePath = path.join(directory, file);
			try {
				const stat = await fs.stat(filePath);
				if (stat.isDirectory()) {
					await fs.rm(filePath, { recursive: true, force: true });
				} else {
					await fs.unlink(filePath);
				}
			} catch (err) {
				console.warn(`Could not delete ${filePath}: ${err}`);
			}
		}
	} catch (err) {
		console.warn(`Could not read directory ${directory}: ${err}`);
	}
}
