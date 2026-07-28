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
	extractVerifiedArchive,
	promoteStagedDirectory,
} from "@/server/scripts/dependencies/utils/verified-artifact";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "uv";
const version = "0.8.3";

function uvArtifact(
	name: string,
	sha256: string,
	format: "tar.gz" | "zip",
): ArtifactMetadata {
	return {
		id: `uv-${name}`,
		version,
		url: `https://github.com/astral-sh/uv/releases/download/${version}/${name}`,
		allowedHosts: GITHUB_RELEASE_HOSTS,
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 250 * 1024 * 1024,
		archive: {
			format,
			limits: { maxMembers: 100, maxExpandedBytes: 500 * 1024 * 1024 },
		},
	};
}

// Digests are from the immutable GitHub release asset metadata for uv 0.8.3.
const artifacts: Record<string, Record<string, ArtifactMetadata>> = {
	linux: {
		amd64: uvArtifact(
			"uv-x86_64-unknown-linux-gnu.tar.gz",
			"427c27ed5f87bf91aa045cf459ea34d348ed6377c62c3c054f1b4046b2f83fe2",
			"tar.gz",
		),
		arm64: uvArtifact(
			"uv-aarch64-unknown-linux-gnu.tar.gz",
			"e82b5a3eb19e5087a6ea92800b0402f60378bd395e3483acd0b46124128ab71f",
			"tar.gz",
		),
	},
	macos: {
		amd64: uvArtifact(
			"uv-x86_64-apple-darwin.tar.gz",
			"77eac9622f76ad89a8c59b31a96277aa61eb290d2949c69ab2061076471aeda2",
			"tar.gz",
		),
		arm64: uvArtifact(
			"uv-aarch64-apple-darwin.tar.gz",
			"9ebfe9f3b51187932ef97270b689da48261acacadd6ea7018d2cc62719c86ffe",
			"tar.gz",
		),
	},
	windows: {
		amd64: uvArtifact(
			"uv-x86_64-pc-windows-msvc.zip",
			"4ca84e28b08f48255f95156c5987d61a5e4c51a43372708bc6d84e994eeb7bdb",
			"zip",
		),
		arm64: uvArtifact(
			"uv-aarch64-pc-windows-msvc.zip",
			"6e0692b817c5d6cfddad13ad177e866e36d95e8d32b4a296a49d937fdcda18d3",
			"zip",
		),
		x86: uvArtifact(
			"uv-i686-pc-windows-msvc.zip",
			"5d272849a94b7ad36711f336d745e08ed3732042fc51f5c7f28bfc4e95463615",
			"zip",
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

	const tempDir = path.join(binFolder, "temp");
	const depFolder = path.join(binFolder, depName);
	const downloadStage = await createPrivateStagingDirectory(
		tempDir,
		"uv-download-",
	);
	const artifactPath = path.join(
		downloadStage,
		path.basename(new URL(artifact.url).pathname),
	);
	let extractionStage: string | undefined;
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying ${depName} ${version} for ${platform} (${arch})...`,
		});
		await downloadVerifiedArtifact(artifact, artifactPath);
		extractionStage = await extractVerifiedArchive(
			artifactPath,
			artifact,
			tempDir,
		);
		await promoteStagedDirectory(extractionStage, depFolder);
		extractionStage = undefined;
	} catch (error) {
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

	const cacheDir = path.join(binFolder, "cache", depName);
	addValue("PATH", depFolder);
	addValue(
		"PATH",
		path.join(
			depFolder,
			path.basename(artifact.url).replace(/\.zip$|\.tar\.gz$/i, ""),
		),
	);
	addValue("UV_PYTHON_INSTALL_DIR", cacheDir);
	addValue("UV_CACHE_DIR", cacheDir);
	addValue("PIP_CACHE_DIR", path.join(binFolder, "cache", "pip"));
	io.to(id).emit("installDep", {
		type: "log",
		content: `${depName} installed successfully`,
	});
	return { success: true };
}

export async function uninstall(binFolder: string): Promise<void> {
	const depFolder = path.join(binFolder, depName);
	const cacheDir = path.join(binFolder, "cache", depName);
	if (fs.existsSync(depFolder)) {
		logger.info(`Removing cache in ${cacheDir}...`);
		await fs.promises.rm(cacheDir, { recursive: true, force: true });
		logger.info(`Removing ${depName} folder in ${depFolder}...`);
		await fs.promises.rm(depFolder, { recursive: true, force: true });
		removeValue(depFolder, "PATH");
		removeKey("UV_CACHE_DIR");
		logger.info(`${depName} uninstalled successfully`);
	}
}
