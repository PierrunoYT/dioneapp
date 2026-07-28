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
	createPrivateStagingDirectory,
	downloadVerifiedArtifact,
	extractVerifiedArchive,
	promoteStagedDirectory,
} from "@/server/scripts/dependencies/utils/verified-artifact";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "node";
const version = "v22.20.0";

function nodeWindowsArtifact(target: string, sha256: string): ArtifactMetadata {
	const name = `node-${version}-win-${target}.zip`;
	return {
		id: name,
		version,
		url: `https://nodejs.org/dist/${version}/${name}`,
		allowedHosts: ["nodejs.org"],
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 200 * 1024 * 1024,
		archive: {
			format: "zip",
			limits: { maxMembers: 10_000, maxExpandedBytes: 1024 * 1024 * 1024 },
		},
	};
}

// Digests are from Node.js v22.20.0's vendor-published SHASUMS256.txt.
const windowsArtifacts: Record<string, ArtifactMetadata> = {
	amd64: nodeWindowsArtifact(
		"x64",
		"bb819d6eb8f5bfda294bbc83a7e4ec6539da67c4233d54b0d655b9248b15e29d",
	),
	arm64: nodeWindowsArtifact(
		"arm64",
		"b12919e609b4fa1176ba8a155b49f761419a0c7cc97b42e6be09874a3f760ab6",
	),
	x86: nodeWindowsArtifact(
		"x86",
		"b46cf58bae2925d1122975dc758063928eca7b6a28c676bf500ad11599d7fa03",
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
	_requiredVersion?: string,
	signal?: AbortSignal,
): Promise<{ success: boolean }> {
	const platform = getOS();
	const arch = getArch();
	const artifact = platform === "windows" ? windowsArtifacts[arch] : undefined;
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content:
				platform === "windows"
					? `No verified Node.js artifact is available for ${arch}.`
					: "Bundled Node.js installation is disabled on this platform because the vendor tarballs contain links; use a system Node.js installation.",
		});
		return { success: false };
	}
	if (signal?.aborted) return { success: false };

	const tempDir = path.join(binFolder, "temp");
	const depFolder = path.join(binFolder, depName);
	const downloadStage = await createPrivateStagingDirectory(
		tempDir,
		"node-download-",
	);
	const artifactPath = path.join(
		downloadStage,
		path.basename(new URL(artifact.url).pathname),
	);
	let extractionStage: string | undefined;
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying Node.js ${version} for ${arch}...`,
		});
		await downloadVerifiedArtifact(artifact, artifactPath, { signal });
		if (signal?.aborted) return { success: false };
		extractionStage = await extractVerifiedArchive(
			artifactPath,
			artifact,
			tempDir,
		);
		const target = arch === "amd64" ? "x64" : arch;
		const extractedRoot = path.join(
			extractionStage,
			`node-${version}-win-${target}`,
		);
		if (!fs.statSync(extractedRoot).isDirectory()) {
			throw new Error("Verified Node.js archive has an unexpected layout.");
		}
		await promoteStagedDirectory(extractedRoot, depFolder);
		await fsp.rm(extractionStage, { recursive: true, force: true });
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

	const cacheDir = path.join(binFolder, "cache", depName);
	addValue("PATH", depFolder);
	addValue("PATH", path.join(depFolder, "node_modules"));
	addValue("NPM_CONFIG_CACHE", cacheDir);
	addValue("NPM_CONFIG_STORE_DIR", cacheDir);
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
		removeKey("NPM_CONFIG_CACHE");
		removeKey("NPM_CONFIG_STORE_DIR");
		logger.info(`${depName} uninstalled successfully`);
	}
}
