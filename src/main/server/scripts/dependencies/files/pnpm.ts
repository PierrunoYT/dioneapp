import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
	addValue,
	getAllValues,
	removeKey,
	removeValue,
} from "@/server/scripts/dependencies/environment";
import { getArch, getOS } from "@/server/scripts/dependencies/utils/system";
import {
	type ArtifactMetadata,
	GITHUB_RELEASE_HOSTS,
	createPrivateStagingDirectory,
	downloadVerifiedArtifact,
	promoteStagedDirectory,
} from "@/server/scripts/dependencies/utils/verified-artifact";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "pnpm";
const version = "10.13.1";

function pnpmArtifact(name: string, sha256: string): ArtifactMetadata {
	return {
		id: `pnpm-${name}`,
		version,
		url: `https://github.com/pnpm/pnpm/releases/download/v${version}/${name}`,
		allowedHosts: GITHUB_RELEASE_HOSTS,
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 100 * 1024 * 1024,
	};
}

// Digests are from the immutable GitHub release asset metadata for pnpm 10.13.1.
const artifacts: Record<string, Record<string, ArtifactMetadata>> = {
	linux: {
		amd64: pnpmArtifact(
			"pnpm-linux-x64",
			"e1cab530ea8252eb90e4add71d95838fd6f2656e6977f120df5ecb6f5b2822e0",
		),
		arm64: pnpmArtifact(
			"pnpm-linux-arm64",
			"0f6d0a1e1b95f2231ce76c13330c754bb76b8f069ca165e5cb8dbe225259f841",
		),
	},
	macos: {
		amd64: pnpmArtifact(
			"pnpm-macos-x64",
			"29de572383f9bab9342e2677bce395b4a91d3e9cf2cd46d17d51a8e8fc847b56",
		),
		arm64: pnpmArtifact(
			"pnpm-macos-arm64",
			"831e5ce1a1b98c922088a3b93dbf1f3a9cc4d689da6a32f8e743e4aabadd2981",
		),
	},
	windows: {
		amd64: pnpmArtifact(
			"pnpm-win-x64.exe",
			"dc342fd6a2d0a9701cc724e6972e8cbc73991de5fc3fff70c201b6433612f78b",
		),
		arm64: pnpmArtifact(
			"pnpm-win-arm64.exe",
			"7b7db1a83f7af44cde0f0ca33be959ccf73fdab2d90d100970231376024de8b0",
		),
	},
};

export async function isInstalled(
	binFolder: string,
): Promise<{ installed: boolean; reason: string }> {
	const depFolder = path.join(binFolder, depName);
	if (!fs.existsSync(depFolder) || fs.readdirSync(depFolder).length === 0) {
		return { installed: false, reason: "not-installed" };
	}
	try {
		await new Promise<string>((resolve, reject) => {
			execFile(depName, ["-v"], { env: getAllValues() }, (error, stdout) => {
				if (error) reject(error);
				else resolve(stdout);
			});
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
): Promise<{ success: boolean }> {
	const platform = getOS();
	const arch = getArch();
	const artifact = artifacts[platform]?.[arch];
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content: `No verified artifact is available for ${depName} on ${platform} (${arch}).`,
		});
		return { success: false };
	}

	const depFolder = path.join(binFolder, depName);
	const staging = await createPrivateStagingDirectory(
		path.join(binFolder, "temp"),
		"pnpm-install-",
	);
	const executablePath = path.join(
		staging,
		platform === "windows" ? "pnpm.exe" : "pnpm",
	);
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying ${depName} ${version} for ${platform} (${arch})...`,
		});
		await downloadVerifiedArtifact(artifact, executablePath);
		await fsp.chmod(executablePath, 0o755);
		await promoteStagedDirectory(staging, depFolder);
	} catch (error) {
		await fsp.rm(staging, { recursive: true, force: true });
		logger.error(`Secure installation failed for ${depName}:`, error);
		io.to(id).emit("installDep", {
			type: "error",
			content: `Secure installation failed for ${depName}: ${String(error)}`,
		});
		return { success: false };
	}

	addValue("PATH", depFolder);
	addValue("XDG_CACHE_HOME", path.join(binFolder, "cache", depName, "cache"));
	addValue("XDG_STATE_HOME", path.join(binFolder, "cache", depName, "state"));
	addValue("XDG_DATA_HOME", path.join(binFolder, "cache", depName, "data"));
	io.to(id).emit("installDep", {
		type: "log",
		content: `${depName} installed successfully`,
	});
	return { success: true };
}

export async function uninstall(binFolder: string): Promise<void> {
	const depFolder = path.join(binFolder, depName);
	if (fs.existsSync(depFolder)) {
		logger.info(`Removing ${depName} folder in ${depFolder}...`);
		fs.rmSync(depFolder, { recursive: true, force: true });
		removeValue(depFolder, "PATH");
		removeKey("XDG_CACHE_HOME");
		removeKey("XDG_STATE_HOME");
		removeKey("XDG_DATA_HOME");
		logger.info(`${depName} uninstalled successfully`);
	}
}
