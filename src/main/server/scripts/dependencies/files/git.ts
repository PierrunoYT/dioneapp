import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { closeFile } from "@/server/scripts/delete";
import {
	addValue,
	getAllValues,
	removeValue,
} from "@/server/scripts/dependencies/environment";
import { getArch, getOS } from "@/server/scripts/dependencies/utils/system";
import {
	type ArtifactMetadata,
	GITHUB_RELEASE_HOSTS,
	createPrivateStagingDirectory,
	downloadVerifiedArtifact,
	extractVerifiedArchive,
	promoteStagedDirectory,
} from "@/server/scripts/dependencies/utils/verified-artifact";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "git";
const version = "2.50.1.windows.1";

function gitArtifact(name: string, sha256: string): ArtifactMetadata {
	return {
		id: `git-${name}`,
		version,
		url: `https://github.com/git-for-windows/git/releases/download/v${version}/${name}`,
		allowedHosts: GITHUB_RELEASE_HOSTS,
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 200 * 1024 * 1024,
		archive: {
			format: "zip",
			limits: { maxMembers: 20_000, maxExpandedBytes: 2 * 1024 * 1024 * 1024 },
		},
	};
}

// Digests are from the immutable Git for Windows v2.50.1.windows.1 release assets.
const windowsArtifacts: Record<string, ArtifactMetadata> = {
	amd64: gitArtifact(
		"MinGit-2.50.1-64-bit.zip",
		"6f672aebe9e488a246efd6875f9197dbc0d9a40100e218acc3877cba2b206c45",
	),
	arm64: gitArtifact(
		"MinGit-2.50.1-arm64.zip",
		"25d45da2f84c5faae01e55129498b8466ad26966f775964be761f14f24d11d75",
	),
	x86: gitArtifact(
		"MinGit-2.50.1-32-bit.zip",
		"d312bd9d9ff19bc85dd6dc46d3d1c10f63ab65f29a3d595b6376074025dc0809",
	),
};

export async function isInstalled(
	binFolder: string,
): Promise<{ installed: boolean; reason: string }> {
	if (process.platform === "linux" || process.platform === "darwin") {
		return { installed: true, reason: "system-installation" };
	}
	const depFolder = path.join(binFolder, depName);
	if (!fs.existsSync(depFolder) || fs.readdirSync(depFolder).length === 0) {
		return { installed: false, reason: "not-installed" };
	}
	try {
		await new Promise<string>((resolve, reject) => {
			execFile(
				depName,
				["--version"],
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
	binFolder: string,
	id: string,
	io: Server,
	_requiredVersion?: string,
	signal?: AbortSignal,
): Promise<{ success: boolean }> {
	const platform = getOS();
	if (platform !== "windows") {
		io.to(id).emit("installDep", {
			type: "log",
			content: "Using the operating system Git installation.",
		});
		return { success: true };
	}

	const arch = getArch();
	const artifact = windowsArtifacts[arch];
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content: `No verified Git artifact is available for ${arch}.`,
		});
		return { success: false };
	}

	const tempDir = path.join(binFolder, "temp");
	const depFolder = path.join(binFolder, depName);
	const downloadStage = await createPrivateStagingDirectory(
		tempDir,
		"git-download-",
	);
	const artifactPath = path.join(
		downloadStage,
		path.basename(new URL(artifact.url).pathname),
	);
	let extractionStage: string | undefined;
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying Git ${version} for ${arch}...`,
		});
		await downloadVerifiedArtifact(artifact, artifactPath, { signal });
		extractionStage = await extractVerifiedArchive(
			artifactPath,
			artifact,
			tempDir,
		);
		await promoteStagedDirectory(extractionStage, depFolder);
		extractionStage = undefined;
	} catch (error) {
		if (signal?.aborted) return { success: false };
		logger.error(`Secure installation failed for ${depName}:`, error);
		io.to(id).emit("installDep", {
			type: "error",
			content: `Secure installation failed for ${depName}: ${String(error)}`,
		});
		return { success: false };
	} finally {
		await fsp.rm(downloadStage, { recursive: true, force: true });
		if (extractionStage) {
			await fsp.rm(extractionStage, { recursive: true, force: true });
		}
	}

	addValue("PATH", path.join(depFolder, "cmd"));
	addValue("GIT_EXEC_PATH", path.join(depFolder, "mingw64", "bin"));
	io.to(id).emit("installDep", {
		type: "log",
		content: `${depName} installed successfully`,
	});
	return { success: true };
}

export async function uninstall(binFolder: string): Promise<void> {
	const depFolder = path.join(binFolder, depName);
	if (!fs.existsSync(depFolder)) {
		throw new Error(`Dependency ${depName} is not installed`);
	}
	logger.info(`Removing ${depName} folder in ${depFolder}...`);
	await closeFile(depFolder);
	await fs.promises.rm(depFolder, { recursive: true, force: true });
	removeValue(path.join(depFolder, "cmd"), "PATH");
	removeValue(path.join(depFolder, "mingw64", "bin"), "GIT_EXEC_PATH");
	logger.info(`${depName} uninstalled successfully`);
}
