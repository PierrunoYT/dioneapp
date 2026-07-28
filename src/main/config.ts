import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import logger from "@/server/utils/logger";
import { app } from "electron";

export interface AppConfig {
	codename: string;
	firstLaunch: boolean;
	theme: "light" | "dark";
	language: string;
	enableDesktopNotifications: boolean;
	notifyOnInstallComplete: boolean;
	autoOpenAfterInstall: boolean;
	defaultInstallFolder: string;
	defaultBinFolder: string;
	defaultLogsPath: string;
	compactMode: boolean;
	layoutMode: "sidebar" | "topbar";
	alwaysUninstallDependencies: boolean;
	enableDiscordRPC: boolean;
	disableAutoUpdates: boolean;
	enableSuccessSound: boolean;
	disableFeaturedVideos: boolean;
}

export type AppConfigPatch = Partial<AppConfig>;

const CONFIG_KEYS = new Set<keyof AppConfig>([
	"codename",
	"firstLaunch",
	"theme",
	"language",
	"enableDesktopNotifications",
	"notifyOnInstallComplete",
	"autoOpenAfterInstall",
	"defaultInstallFolder",
	"defaultBinFolder",
	"defaultLogsPath",
	"compactMode",
	"layoutMode",
	"alwaysUninstallDependencies",
	"enableDiscordRPC",
	"disableAutoUpdates",
	"enableSuccessSound",
	"disableFeaturedVideos",
]);

const PATH_KEYS = new Set<keyof AppConfig>([
	"defaultInstallFolder",
	"defaultBinFolder",
	"defaultLogsPath",
]);

function normalizeForComparison(value: string): string {
	const resolved = path.resolve(value);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSameOrChild(candidate: string, parent: string): boolean {
	const relative = path.relative(
		normalizeForComparison(parent),
		normalizeForComparison(candidate),
	);
	return (
		relative === "" ||
		(!relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

function canonicalizePath(value: string): string {
	let existing = path.resolve(value);
	const missingSegments: string[] = [];
	while (true) {
		try {
			fs.lstatSync(existing);
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		const parent = path.dirname(existing);
		if (parent === existing) break;
		missingSegments.unshift(path.basename(existing));
		existing = parent;
	}
	return path.join(fs.realpathSync(existing), ...missingSegments);
}

function validateOwnedPath(value: string, key: string): string {
	const candidate = canonicalizePath(value);
	const parsed = path.parse(candidate);
	if (
		normalizeForComparison(candidate) === normalizeForComparison(parsed.root)
	) {
		throw new TypeError(
			`Unsafe filesystem root for configuration field: ${key}`,
		);
	}

	const userData = app.getPath("userData");
	if (normalizeForComparison(candidate) === normalizeForComparison(userData)) {
		return candidate;
	}
	const home = app.getPath("home");
	if (isSameOrChild(home, candidate)) {
		throw new TypeError(`Unsafe path for configuration field: ${key}`);
	}

	const applicationRoot = app.isPackaged
		? path.dirname(app.getPath("exe"))
		: process.cwd();
	const protectedRoots = [
		applicationRoot,
		process.env.SystemRoot,
		process.env.ProgramFiles,
		process.env["ProgramFiles(x86)"],
		...(process.platform === "win32"
			? []
			: [
					"/bin",
					"/boot",
					"/dev",
					"/etc",
					"/lib",
					"/proc",
					"/sbin",
					"/sys",
					"/usr",
				]),
	].filter((root): root is string => Boolean(root));

	for (const protectedRoot of protectedRoots) {
		if (
			isSameOrChild(candidate, protectedRoot) ||
			isSameOrChild(protectedRoot, candidate)
		) {
			throw new TypeError(`Unsafe path for configuration field: ${key}`);
		}
	}

	return candidate;
}

export function parseConfigPatch(value: unknown): AppConfigPatch {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("Configuration patch must be an object");
	}
	const patch: Record<string, unknown> = {};
	for (const [key, fieldValue] of Object.entries(value)) {
		if (!CONFIG_KEYS.has(key as keyof AppConfig)) {
			throw new TypeError(`Unknown configuration field: ${key}`);
		}
		const defaultValue = defaultConfig[key as keyof AppConfig];
		if (
			(typeof defaultValue === "string" && typeof fieldValue !== "string") ||
			(typeof defaultValue === "boolean" && typeof fieldValue !== "boolean")
		) {
			throw new TypeError(`Invalid type for configuration field: ${key}`);
		}
		if (PATH_KEYS.has(key as keyof AppConfig)) {
			if (!(fieldValue as string).trim() || /\0/.test(fieldValue as string)) {
				throw new TypeError(`Invalid path for configuration field: ${key}`);
			}
			patch[key] = validateOwnedPath(fieldValue as string, key);
		} else {
			patch[key] = fieldValue;
		}
	}
	if (patch.theme && patch.theme !== "light" && patch.theme !== "dark") {
		throw new TypeError("Invalid theme");
	}
	if (
		patch.layoutMode &&
		patch.layoutMode !== "sidebar" &&
		patch.layoutMode !== "topbar"
	) {
		throw new TypeError("Invalid layout mode");
	}
	return patch as AppConfigPatch;
}
// generate codename
function shortHash(value: string) {
	return crypto
		.createHash("sha1")
		.update(value)
		.digest("hex")
		.slice(0, 6)
		.toUpperCase();
}
// default config
export const defaultConfig: AppConfig = {
	codename: shortHash(
		process.env.USER ||
			process.env.USERNAME ||
			os?.userInfo?.()?.username ||
			crypto.randomUUID(),
	),
	firstLaunch: false,
	theme: "dark",
	language: "en",
	enableDesktopNotifications: true,
	notifyOnInstallComplete: true,
	autoOpenAfterInstall: true,
	defaultInstallFolder: path.join(app.getPath("userData")),
	defaultBinFolder: path.join(app.getPath("userData")),
	defaultLogsPath: path.join(app.getPath("userData")),
	compactMode: false,
	layoutMode: "sidebar",
	alwaysUninstallDependencies: false,
	enableDiscordRPC: true,
	disableAutoUpdates: false,
	enableSuccessSound: true,
	disableFeaturedVideos: false,
};
// get config file
export const getConfigPath = () => {
	return path.join(app.getPath("userData"), "config.json");
};
// read config
export const readConfig = (): AppConfig => {
	try {
		const configPath = getConfigPath();

		if (!fs.existsSync(configPath)) {
			writeConfig(defaultConfig);
			return defaultConfig;
		}

		const storedValue = JSON.parse(
			fs.readFileSync(configPath, "utf8"),
		) as Record<string, unknown>;
		// Ignore obsolete fields in files written by older releases, while still
		// applying the same type/path validation used for runtime patches.
		const storedConfig = parseConfigPatch(
			Object.fromEntries(
				Object.entries(storedValue).filter(([key]) =>
					CONFIG_KEYS.has(key as keyof AppConfig),
				),
			),
		);

		const mergedConfig: AppConfig = {
			...defaultConfig,
			...storedConfig,
		};

		if (Object.keys(defaultConfig).some((key) => !(key in storedConfig))) {
			writeConfig(mergedConfig);
		}

		return mergedConfig;
	} catch (error) {
		logger.error("Error reading configuration:", error);
		return defaultConfig;
	}
};
// write config
export const writeConfig = (config: AppConfig) => {
	const validated = { ...defaultConfig, ...parseConfigPatch(config) };

	if (!fs.existsSync(validated.defaultInstallFolder)) {
		fs.mkdirSync(validated.defaultInstallFolder, { recursive: true });
	}

	if (!fs.existsSync(validated.defaultBinFolder)) {
		fs.mkdirSync(validated.defaultBinFolder, { recursive: true });
	}

	const configPath = getConfigPath();
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	const temporaryPath = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
	let fd: number | undefined;
	try {
		fd = fs.openSync(temporaryPath, "wx", 0o600);
		fs.writeFileSync(fd, JSON.stringify(validated));
		fs.fsyncSync(fd);
		fs.closeSync(fd);
		fd = undefined;
		fs.renameSync(temporaryPath, configPath);
		const directoryFd = fs.openSync(path.dirname(configPath), "r");
		try {
			fs.fsyncSync(directoryFd);
		} finally {
			fs.closeSync(directoryFd);
		}
	} finally {
		if (fd !== undefined) fs.closeSync(fd);
		try {
			fs.unlinkSync(temporaryPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				logger.warn("Unable to clean up temporary configuration file");
			}
		}
	}
};
// update config
export const updateConfig = (newSettings: Partial<AppConfig>) => {
	const patch = parseConfigPatch(newSettings);
	const currentConfig = readConfig();
	const updatedConfig: AppConfig = {
		...defaultConfig,
		...currentConfig,
		...patch,
	};

	if (patch.defaultBinFolder) {
		if (patch.defaultBinFolder !== currentConfig.defaultBinFolder) {
			try {
				if (!fs.existsSync(patch.defaultBinFolder)) {
					fs.mkdirSync(patch.defaultBinFolder, { recursive: true });
				}
			} catch (error) {
				logger.error(`Failed to create bin folder: ${error}`);
			}
		}
	}

	if (patch.defaultInstallFolder) {
		if (patch.defaultInstallFolder !== currentConfig.defaultInstallFolder) {
			try {
				if (!fs.existsSync(patch.defaultInstallFolder)) {
					fs.mkdirSync(patch.defaultInstallFolder, { recursive: true });
				}
			} catch (error) {
				logger.error(`Failed to create install folder: ${error}`);
			}
		}
	}

	writeConfig(updatedConfig);
	return readConfig();
};
// reset config to default
export const resetConfig = () => {
	writeConfig(defaultConfig);
};

export const deleteConfig = () => {
	const path = getConfigPath();
	fs.unlinkSync(path);
};
