import fs from "node:fs";
import path from "node:path";
import { readConfig as userConfig } from "@/config";
import {
	addValue,
	getAllValues,
} from "@/server/scripts/dependencies/environment";
import { getArch, getOS } from "@/server/scripts/dependencies/utils/system";
import type { ProcessCommand } from "@/server/scripts/process";
import { app } from "electron";

const ENVIRONMENT_IDENTIFIER = /^[A-Za-z0-9._-]{1,64}$/;
const PYTHON_VERSION = /^\d{1,2}(?:\.\d{1,3}){0,2}$/;
const ENVIRONMENT_TYPES = new Set(["uv", "conda"]);

export function validateEnvironmentIdentifier(value: unknown): string {
	if (
		typeof value !== "string" ||
		!ENVIRONMENT_IDENTIFIER.test(value) ||
		value === "." ||
		value === ".." ||
		value.endsWith(".")
	) {
		throw new Error(
			"Environment name must contain only letters, numbers, dots, underscores, or hyphens",
		);
	}
	return value;
}

export function validatePythonVersion(value: unknown): string {
	if (value === "" || value === undefined) return "";
	if (typeof value !== "string" || !PYTHON_VERSION.test(value)) {
		throw new Error("Python version must be a numeric version such as 3.11.9");
	}
	return value;
}

function validateEnvironmentType(value: unknown): "uv" | "conda" {
	if (typeof value !== "string" || !ENVIRONMENT_TYPES.has(value)) {
		throw new Error("Environment type must be either uv or conda");
	}
	return value as "uv" | "conda";
}

async function resolveEnvironmentPath(
	baseDirectory: string,
	environmentName: string,
): Promise<{ environmentPath: string; exists: boolean }> {
	const canonicalBase = await fs.promises.realpath(baseDirectory);
	const environmentPath = path.resolve(canonicalBase, environmentName);
	const relative = path.relative(canonicalBase, environmentPath);
	if (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error("Environment path escapes the application root");
	}
	try {
		await fs.promises.lstat(environmentPath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { environmentPath, exists: false };
		}
		throw error;
	}
	const canonicalEnvironment = await fs.promises.realpath(environmentPath);
	const canonicalRelative = path.relative(canonicalBase, canonicalEnvironment);
	if (
		canonicalRelative === ".." ||
		canonicalRelative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(canonicalRelative)
	) {
		throw new Error("Environment path resolves outside the application root");
	}
	if (!(await fs.promises.stat(canonicalEnvironment)).isDirectory()) {
		throw new Error("Environment path is not a directory");
	}
	return { environmentPath: canonicalEnvironment, exists: true };
}

function normalizeCommands(commands: unknown[]): ProcessCommand[] {
	return commands.flatMap((value) => {
		if (typeof value === "string" && value.trim()) {
			return [{ command: value.trim() }];
		}
		if (
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			typeof (value as ProcessCommand).command === "string" &&
			(value as ProcessCommand).command?.trim()
		) {
			const command = value as ProcessCommand;
			return [{ ...command, command: command.command?.trim() }];
		}
		return [];
	});
}

function uvExecutablePath(): string {
	const config = userConfig();
	const arch = getArch();
	const platform = getOS();
	const uvFolder =
		platform === "linux"
			? arch === "amd64"
				? "uv-x86_64-unknown-linux-gnu"
				: "uv-aarch64-unknown-linux-gnu"
			: platform === "macos"
				? arch === "amd64"
					? "uv-x86_64-apple-darwin"
					: "uv-aarch64-apple-darwin"
				: "";
	return path.join(
		config?.defaultBinFolder || app.getPath("userData"),
		"bin",
		"uv",
		uvFolder,
		process.platform === "win32" ? "uv.exe" : "uv",
	);
}

function condaExecutablePath(): string {
	const config = userConfig();
	return path.join(
		config?.defaultBinFolder || app.getPath("userData"),
		"bin",
		"conda",
		process.platform === "win32" ? "Scripts" : "bin",
		process.platform === "win32" ? "conda.exe" : "conda",
	);
}

function commandMetadata(command: ProcessCommand): ProcessCommand {
	return {
		cwd: command.cwd,
		platform: command.platform,
		gpus: command.gpus,
		displayCommand: command.command,
	};
}

export async function createVirtualEnvCommands(
	envName: string,
	commands: unknown[],
	baseDir: string,
	pythonVersion: string,
	envType = "uv",
): Promise<ProcessCommand[]> {
	const validatedName = validateEnvironmentIdentifier(envName);
	const validatedVersion = validatePythonVersion(pythonVersion);
	const validatedType = validateEnvironmentType(envType);
	const normalizedCommands = normalizeCommands(commands);
	const { environmentPath, exists } = await resolveEnvironmentPath(
		baseDir,
		validatedName,
	);
	const pythonArguments = validatedVersion
		? [
				validatedType === "conda" ? `python=${validatedVersion}` : "--python",
				...(validatedType === "conda" ? [] : [validatedVersion]),
			]
		: [];

	if (validatedType === "conda") {
		const conda = condaExecutablePath();
		const result: ProcessCommand[] = [];
		if (!exists) {
			result.push({
				file: conda,
				args: [
					"create",
					"--prefix",
					environmentPath,
					...pythonArguments,
					"--yes",
				],
				cwd: ".",
				displayCommand: `conda create --prefix ${validatedName}`,
			});
		}
		const shell =
			process.platform === "win32"
				? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe"
				: process.env.SHELL || "/bin/bash";
		const shellArguments =
			process.platform === "win32" ? ["/D", "/S", "/C"] : ["-c"];
		for (const command of normalizedCommands) {
			result.push({
				...commandMetadata(command),
				file: conda,
				args: [
					"run",
					"--no-capture-output",
					"--prefix",
					environmentPath,
					shell,
					...shellArguments,
					command.command as string,
				],
			});
		}
		return result;
	}

	const environmentBin = path.join(
		environmentPath,
		process.platform === "win32" ? "Scripts" : "bin",
	);
	const variables = getAllValues();
	const existingPath = String(variables.PATH || process.env.PATH || "");
	if (!existingPath.split(path.delimiter).includes(environmentBin)) {
		addValue("PATH", environmentBin);
	}
	const environment = {
		PATH: environmentBin,
		VIRTUAL_ENV: environmentPath,
	};
	const result: ProcessCommand[] = [];
	if (!exists) {
		result.push({
			file: uvExecutablePath(),
			args: ["venv", ...pythonArguments, environmentPath],
			cwd: ".",
			displayCommand: `uv venv ${validatedName}`,
		});
	}
	for (const command of normalizedCommands) {
		result.push({
			...commandMetadata(command),
			command: command.command,
			env: environment,
		});
	}
	return result;
}
