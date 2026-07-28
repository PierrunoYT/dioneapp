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

const depName = "ollama";
const version = "0.32.5";

function ollamaWindowsArtifact(name: string, sha256: string): ArtifactMetadata {
	return {
		id: `ollama-${name}`,
		version,
		url: `https://github.com/ollama/ollama/releases/download/v${version}/${name}`,
		allowedHosts: GITHUB_RELEASE_HOSTS,
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 2 * 1024 * 1024 * 1024,
		archive: {
			format: "zip",
			limits: { maxMembers: 5_000, maxExpandedBytes: 12 * 1024 * 1024 * 1024 },
		},
	};
}

// Digests are from the immutable Ollama v0.32.5 GitHub release assets.
const windowsArtifacts: Record<string, ArtifactMetadata> = {
	amd64: ollamaWindowsArtifact(
		"ollama-windows-amd64.zip",
		"7c941ae084569d298062d29f8139163a3187c76dbca0479c70d085e78fd8c7bb",
	),
	arm64: ollamaWindowsArtifact(
		"ollama-windows-arm64.zip",
		"f7cf76916c24550033500a92fb56b3ce3d225f3d7cde0ce0438e62696b34507a",
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
	const artifact = platform === "windows" ? windowsArtifacts[arch] : undefined;
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content:
				platform === "windows"
					? `No verified Ollama artifact is available for ${arch}.`
					: "Bundled Ollama installation is disabled on this platform because the vendor archives contain links or use an unsupported preflight compression format.",
		});
		return { success: false };
	}

	const tempDir = path.join(binFolder, "temp");
	const depFolder = path.join(binFolder, depName);
	const downloadStage = await createPrivateStagingDirectory(
		tempDir,
		"ollama-download-",
	);
	const artifactPath = path.join(
		downloadStage,
		path.basename(new URL(artifact.url).pathname),
	);
	let extractionStage: string | undefined;
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying Ollama ${version} for ${arch}...`,
		});
		let lastPercent = -1;
		await downloadVerifiedArtifact(artifact, artifactPath, {
			onProgress: (progress) => {
				const percent = Math.floor(progress * 100);
				if (percent !== lastPercent && percent % 5 === 0) {
					lastPercent = percent;
					io.to(id).emit("installDep", {
						type: "log",
						content: `Downloading: ${percent}%`,
					});
				}
			},
		});
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
	fs.mkdirSync(path.join(depFolder, "models"), { recursive: true });
	addValue("PATH", depFolder);
	addValue("OLLAMA_MODELS", path.join(depFolder, "models"));
	addValue("OLLAMA_HOST", "http://localhost:11434");
	addValue("OLLAMA_CACHE", cacheDir);
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
		fs.rmSync(cacheDir, { recursive: true, force: true });
		fs.rmSync(depFolder, { recursive: true, force: true });
		removeValue(depFolder, "PATH");
		removeKey("OLLAMA_MODELS");
		removeKey("OLLAMA_HOST");
		removeKey("OLLAMA_CACHE");
		logger.info(`${depName} uninstalled successfully`);
	}
}
