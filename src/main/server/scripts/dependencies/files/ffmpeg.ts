import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
	getAllValues,
	removeValue,
} from "@/server/scripts/dependencies/environment";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "ffmpeg";

export async function isInstalled(
	binFolder: string,
): Promise<{ installed: boolean; reason: string }> {
	const depFolder = path.join(binFolder, depName);
	if (!fs.existsSync(depFolder) || fs.readdirSync(depFolder).length === 0) {
		return { installed: false, reason: "not-installed" };
	}
	try {
		await new Promise<string>((resolve, reject) => {
			execFile(
				depName,
				["-version"],
				{ env: getAllValues() },
				(error, stdout) => {
					if (error) reject(error);
					else resolve(stdout);
				},
			);
		});
		return { installed: true, reason: "installed" };
	} catch {
		return { installed: false, reason: "error" };
	}
}

export async function install(
	_binFolder: string,
	id: string,
	io: Server,
	_requiredVersion?: string,
	_signal?: AbortSignal,
): Promise<{ success: boolean }> {
	const message =
		"Bundled FFmpeg installation is disabled: the configured Linux assets are mutable rolling releases, and the configured macOS/Windows vendors do not publish a SHA-256 value that can be pinned by Dione.";
	logger.error(message);
	io.to(id).emit("installDep", { type: "error", content: message });
	return { success: false };
}

export async function uninstall(binFolder: string): Promise<void> {
	const depFolder = path.join(binFolder, depName);
	if (fs.existsSync(depFolder)) {
		logger.info(`Removing ${depName} folder in ${depFolder}...`);
		fs.rmSync(depFolder, { recursive: true, force: true });
		removeValue(depFolder, "PATH");
		removeValue(path.join(depFolder, "bin"), "PATH");
		logger.info(`${depName} uninstalled successfully`);
	}
}
