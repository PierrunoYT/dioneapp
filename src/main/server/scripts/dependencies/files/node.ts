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

function nodePosixArtifact(
	platform: "linux" | "darwin",
	target: "x64" | "arm64",
	sha256: string,
): ArtifactMetadata {
	const name = `node-${version}-${platform}-${target}.tar.gz`;
	return {
		id: name,
		version,
		url: `https://nodejs.org/dist/${version}/${name}`,
		allowedHosts: ["nodejs.org"],
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 120 * 1024 * 1024,
		archive: {
			format: "tar.gz",
			allowSymlinks: true,
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

const posixArtifacts: Record<string, ArtifactMetadata> = {
	"linux-amd64": nodePosixArtifact(
		"linux",
		"x64",
		"eeaccb0378b79406f2208e8b37a62479c70595e20be6b659125eb77dd1ab2a29",
	),
	"linux-arm64": nodePosixArtifact(
		"linux",
		"arm64",
		"4181609e03dcb9880e7e5bf956061ecc0503c77a480c6631d868cb1f65a2c7dd",
	),
	"macos-amd64": nodePosixArtifact(
		"darwin",
		"x64",
		"00df9c5df3e4ec6848c26b70fb47bf96492f342f4bed6b17f12d99b3a45eeecc",
	),
	"macos-arm64": nodePosixArtifact(
		"darwin",
		"arm64",
		"cc04a76a09f79290194c0646f48fec40354d88969bec467789a5d55dd097f949",
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
	const artifact =
		platform === "windows"
			? windowsArtifacts[arch]
			: posixArtifacts[`${platform}-${arch}`];
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content: `No verified Node.js artifact is available for ${platform} (${arch}).`,
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
		const artifactPlatform =
			platform === "windows"
				? "win"
				: platform === "macos"
					? "darwin"
					: "linux";
		const extractedRoot = path.join(
			extractionStage,
			`node-${version}-${artifactPlatform}-${target}`,
		);
		if (!(await fsp.lstat(extractedRoot)).isDirectory()) {
			throw new Error("Verified Node.js archive has an unexpected layout.");
		}
		const nodeExecutable = path.join(
			extractedRoot,
			platform === "windows" ? "node.exe" : path.join("bin", "node"),
		);
		if (!(await fsp.lstat(nodeExecutable)).isFile())
			throw new Error("Verified Node.js archive is missing its executable.");
		if (platform !== "windows") {
			await fsp.access(nodeExecutable, fs.constants.X_OK);
			for (const command of ["corepack", "npm", "npx"]) {
				if (
					!(
						await fsp.lstat(path.join(extractedRoot, "bin", command))
					).isSymbolicLink()
				)
					throw new Error(
						`Verified Node.js archive has an invalid ${command} command.`,
					);
			}
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
	addValue(
		"PATH",
		platform === "windows" ? depFolder : path.join(depFolder, "bin"),
	);
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
		await fs.promises.rm(depFolder, { recursive: true, force: true });
		removeValue(depFolder, "PATH");
		removeValue(path.join(depFolder, "bin"), "PATH");
		removeKey("NPM_CONFIG_CACHE");
		removeKey("NPM_CONFIG_STORE_DIR");
		logger.info(`${depName} uninstalled successfully`);
	}
}
