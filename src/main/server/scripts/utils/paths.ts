import fs from "node:fs";
import path from "node:path";
import { readConfig } from "@/config";
import { app } from "electron";
import { validateAppId } from "./app-id";

export { sanitizeScriptName, validateAppId } from "./app-id";

export interface ScriptPathInfo {
	sanitizedName: string;
	installRoot: string;
	appsDir: string;
	workingDir: string;
	dioneFile: string;
}

const getRootDirectory = () =>
	app.isPackaged
		? path.join(path.dirname(app.getPath("exe")))
		: path.join(process.cwd());

export const getInstallRoot = () => {
	const config = readConfig();
	return config?.defaultInstallFolder || getRootDirectory();
};

export const getAppsRoot = () => path.join(getInstallRoot(), "apps");

export const ensureDirectory = async (directory: string) => {
	await fs.promises.mkdir(directory, { recursive: true });
	return directory;
};

export const ensureAppsRootExists = async () => ensureDirectory(getAppsRoot());

const isContained = (root: string, target: string) => {
	const relative = path.relative(root, target);
	return (
		relative !== "" &&
		relative !== ".." &&
		!relative.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(relative)
	);
};

export const resolveCanonicalAppPath = async (
	name: string,
	options: { mustExist?: boolean } = {},
) => {
	const appId = validateAppId(name);
	await ensureAppsRootExists();
	const appsRoot = await fs.promises.realpath(getAppsRoot());
	const target = path.join(appsRoot, appId);
	if (!isContained(appsRoot, target)) {
		throw new Error("Application path escapes applications root");
	}

	try {
		const stats = await fs.promises.lstat(target);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error(
				"Application path must be a direct, non-symlink directory",
			);
		}
		const canonicalTarget = await fs.promises.realpath(target);
		if (!isContained(appsRoot, canonicalTarget)) {
			throw new Error("Application path escapes applications root");
		}
		return canonicalTarget;
	} catch (error: any) {
		if (error?.code !== "ENOENT") throw error;
		if (options.mustExist) throw new Error("Application directory not found");
		return target;
	}
};

export const resolveScriptPaths = (name: string): ScriptPathInfo => {
	const sanitizedName = validateAppId(name);
	const installRoot = getInstallRoot();
	const configuredAppsDir = path.resolve(installRoot, "apps");
	const appsDir = fs.existsSync(configuredAppsDir)
		? fs.realpathSync(configuredAppsDir)
		: configuredAppsDir;
	let workingDir = path.resolve(appsDir, sanitizedName);
	if (!isContained(appsDir, workingDir)) {
		throw new Error("Application path escapes applications root");
	}
	if (fs.existsSync(workingDir)) {
		const stats = fs.lstatSync(workingDir);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error(
				"Application path must be a direct, non-symlink directory",
			);
		}
		workingDir = fs.realpathSync(workingDir);
		if (!isContained(appsDir, workingDir)) {
			throw new Error("Application path escapes applications root");
		}
	}

	return {
		sanitizedName,
		installRoot,
		appsDir,
		workingDir,
		dioneFile: path.join(workingDir, "dione.json"),
	};
};
