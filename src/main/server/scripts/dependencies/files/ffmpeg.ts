import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
	addValue,
	getAllValues,
	removeValue,
} from "@/server/scripts/dependencies/environment";
import { getArch, getOS } from "@/server/scripts/dependencies/utils/system";
import {
	type ArtifactMetadata,
	createPrivateStagingDirectory,
	downloadVerifiedArtifact,
	extractVerifiedArchive,
	promoteStagedDirectory,
} from "@/server/scripts/dependencies/utils/verified-artifact";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "ffmpeg";

function ffmpegArtifact(
	id: string,
	version: string,
	url: string,
	host: string,
	sha256: string,
): ArtifactMetadata {
	return {
		id,
		version,
		url,
		allowedHosts: [host],
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 150 * 1024 * 1024,
		archive: {
			format: "zip",
			limits: { maxMembers: 2_000, maxExpandedBytes: 1024 * 1024 * 1024 },
		},
	};
}

// Digests are published beside these exact, versioned distributor artifacts.
const artifacts: Record<string, ArtifactMetadata> = {
	"windows-amd64": ffmpegArtifact(
		"ffmpeg-8.0.1-essentials_build.zip",
		"8.0.1",
		"https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.0.1-essentials_build.zip",
		"www.gyan.dev",
		"e2aaeaa0fdbc397d4794828086424d4aaa2102cef1fb6874f6ffd29c0b88b673",
	),
	"linux-amd64": ffmpegArtifact(
		"ffmpeg-linux-amd64-8.1.2.zip",
		"8.1.2",
		"https://ffmpeg.martin-riedl.de/download/linux/amd64/1783011670_8.1.2/ffmpeg.zip",
		"ffmpeg.martin-riedl.de",
		"56452c0bfc4ee0325cd615d62f46ba8264f62eed34f727c2224c6c84fa7b8719",
	),
	"linux-arm64": ffmpegArtifact(
		"ffmpeg-linux-arm64-8.1.2.zip",
		"8.1.2",
		"https://ffmpeg.martin-riedl.de/download/linux/arm64/1783010599_8.1.2/ffmpeg.zip",
		"ffmpeg.martin-riedl.de",
		"ab9e16864b6bf4ae7e13bbdbdc29621be11a5c547c57af8d4250e9fa2f5e6461",
	),
	"macos-amd64": ffmpegArtifact(
		"ffmpeg-macos-amd64-8.1.2.zip",
		"8.1.2",
		"https://ffmpeg.martin-riedl.de/download/macos/amd64/1783018342_8.1.2/ffmpeg.zip",
		"ffmpeg.martin-riedl.de",
		"a52ef43883f44c219766d4b3bdde4e635b35465d0b704c01c3a0566b59775df9",
	),
	"macos-arm64": ffmpegArtifact(
		"ffmpeg-macos-arm64-8.1.2.zip",
		"8.1.2",
		"https://ffmpeg.martin-riedl.de/download/macos/arm64/1783011502_8.1.2/ffmpeg.zip",
		"ffmpeg.martin-riedl.de",
		"ef1aa60006c7b77ce170c1608c08d8e4ba1c30c5746f2ac986ded932d0ac2c3c",
	),
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
	binFolder: string,
	id: string,
	io: Server,
	_requiredVersion?: string,
	signal?: AbortSignal,
): Promise<{ success: boolean }> {
	const platform = getOS();
	const arch = getArch();
	const artifact = artifacts[`${platform}-${arch}`];
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content: `No verified FFmpeg artifact is available for ${platform} (${arch}).`,
		});
		return { success: false };
	}
	if (signal?.aborted) return { success: false };

	const tempDir = path.join(binFolder, "temp");
	const depFolder = path.join(binFolder, depName);
	const downloadStage = await createPrivateStagingDirectory(
		tempDir,
		"ffmpeg-download-",
	);
	const artifactPath = path.join(downloadStage, path.basename(artifact.url));
	let extractionStage: string | undefined;
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying FFmpeg ${artifact.version} for ${arch}...`,
		});
		await downloadVerifiedArtifact(artifact, artifactPath, { signal });
		if (signal?.aborted) return { success: false };
		extractionStage = await extractVerifiedArchive(
			artifactPath,
			artifact,
			tempDir,
		);

		let stagedRoot = extractionStage;
		if (platform === "windows") {
			stagedRoot = path.join(extractionStage, "ffmpeg-8.0.1-essentials_build");
		}
		const executable = path.join(
			stagedRoot,
			platform === "windows" ? "bin" : "",
			platform === "windows" ? "ffmpeg.exe" : "ffmpeg",
		);
		if (!(await fsp.stat(executable)).isFile()) {
			throw new Error("Verified FFmpeg archive has an unexpected layout.");
		}
		if (platform !== "windows") await fsp.access(executable, fs.constants.X_OK);
		await promoteStagedDirectory(stagedRoot, depFolder);
		if (stagedRoot !== extractionStage) {
			await fsp.rm(extractionStage, { recursive: true, force: true });
		}
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

	addValue(
		"PATH",
		platform === "windows" ? path.join(depFolder, "bin") : depFolder,
	);
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
		await fs.promises.rm(depFolder, { recursive: true, force: true });
		removeValue(depFolder, "PATH");
		removeValue(path.join(depFolder, "bin"), "PATH");
		logger.info(`${depName} uninstalled successfully`);
	}
}
