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
	type ArchiveFormat,
	type ArtifactMetadata,
	GITHUB_RELEASE_HOSTS,
	createPrivateStagingDirectory,
	downloadVerifiedArtifact,
	extractVerifiedArchive,
	promoteStagedDirectory,
} from "@/server/scripts/dependencies/utils/verified-artifact";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "git_lfs";
const version = "3.7.1";

function gitLfsArtifact(
	name: string,
	sha256: string,
	format: ArchiveFormat,
): ArtifactMetadata {
	return {
		id: `git-lfs-${name}`,
		version,
		url: `https://github.com/git-lfs/git-lfs/releases/download/v${version}/${name}`,
		allowedHosts: GITHUB_RELEASE_HOSTS,
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 100 * 1024 * 1024,
		archive: {
			format,
			limits: { maxMembers: 100, maxExpandedBytes: 250 * 1024 * 1024 },
		},
	};
}

// Digests are from the immutable Git LFS v3.7.1 GitHub release assets.
const artifacts: Record<string, Record<string, ArtifactMetadata>> = {
	linux: {
		amd64: gitLfsArtifact(
			"git-lfs-linux-amd64-v3.7.1.tar.gz",
			"1c0b6ee5200ca708c5cebebb18fdeb0e1c98f1af5c1a9cba205a4c0ab5a5ec08",
			"tar.gz",
		),
		arm64: gitLfsArtifact(
			"git-lfs-linux-arm64-v3.7.1.tar.gz",
			"73a9c90eeb4312133a63c3eaee0c38c019ea7bfa0953d174809d25b18588dd8d",
			"tar.gz",
		),
	},
	macos: {
		amd64: gitLfsArtifact(
			"git-lfs-darwin-amd64-v3.7.1.zip",
			"b5b1b641c0648c83661fa9eda991cd3eff945264dabc2cdf411a80dfe7ec0970",
			"zip",
		),
		arm64: gitLfsArtifact(
			"git-lfs-darwin-arm64-v3.7.1.zip",
			"76260fb34f4ee622ff0a66b857e5954aa49c7e343a92e57a1ec4a760618c94b2",
			"zip",
		),
	},
	windows: {
		amd64: gitLfsArtifact(
			"git-lfs-windows-amd64-v3.7.1.zip",
			"8683cdc3d6c029b49393dcebbaa6265bd6efd9abdcf837be855b4cd42e5e80b6",
			"zip",
		),
		arm64: gitLfsArtifact(
			"git-lfs-windows-arm64-v3.7.1.zip",
			"9441383a3928a7f387223711929292a46ace95580ceed443d61e7b8a4d9615c3",
			"zip",
		),
		x86: gitLfsArtifact(
			"git-lfs-windows-386-v3.7.1.zip",
			"06c05c06523abf3930301b3022527ad881b1a7f8bf036ed6d93c8e68569041bb",
			"zip",
		),
	},
};

async function findBinary(
	root: string,
	binaryName: string,
): Promise<string | undefined> {
	const stack = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) break;
		for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
			const entryPath = path.join(current, entry.name);
			if (entry.isDirectory()) stack.push(entryPath);
			else if (entry.isFile() && entry.name === binaryName) return entryPath;
		}
	}
	return undefined;
}

export async function isInstalled(
	binFolder: string,
): Promise<{ installed: boolean; reason: string; version?: string }> {
	const depFolder = path.join(binFolder, depName);
	const command =
		process.platform === "win32"
			? path.join(depFolder, "git-lfs.exe")
			: "git-lfs";
	if (process.platform === "win32" && !fs.existsSync(command)) {
		return { installed: false, reason: "not-installed" };
	}
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			execFile(
				command,
				["--version"],
				{ env: getAllValues() },
				(error, output) => {
					if (error) reject(error);
					else resolve(output);
				},
			);
		});
		const match = stdout.match(/git-lfs[\/ ]?([\d.]+)/i);
		return { installed: true, reason: "installed", version: match?.[1] };
	} catch {
		return { installed: false, reason: "not-installed" };
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
			content: `No verified Git LFS artifact is available for ${platform} (${arch}).`,
		});
		return { success: false };
	}

	const tempDir = path.join(binFolder, "temp");
	const depFolder = path.join(binFolder, depName);
	const downloadStage = await createPrivateStagingDirectory(
		tempDir,
		"git-lfs-download-",
	);
	const installStage = await createPrivateStagingDirectory(
		tempDir,
		"git-lfs-install-",
	);
	const artifactPath = path.join(
		downloadStage,
		path.basename(new URL(artifact.url).pathname),
	);
	let extractionStage: string | undefined;
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying Git LFS ${version} for ${platform} (${arch})...`,
		});
		await downloadVerifiedArtifact(artifact, artifactPath);
		extractionStage = await extractVerifiedArchive(
			artifactPath,
			artifact,
			tempDir,
		);
		const binaryName = platform === "windows" ? "git-lfs.exe" : "git-lfs";
		const binaryPath = await findBinary(extractionStage, binaryName);
		if (!binaryPath)
			throw new Error(`${binaryName} was not found in the verified archive.`);
		const targetPath = path.join(installStage, binaryName);
		await fsp.copyFile(binaryPath, targetPath, fs.constants.COPYFILE_EXCL);
		await fsp.chmod(targetPath, 0o755);
		await promoteStagedDirectory(installStage, depFolder);
	} catch (error) {
		logger.error(`Secure installation failed for ${depName}:`, error);
		io.to(id).emit("installDep", {
			type: "error",
			content: `Secure installation failed for ${depName}: ${String(error)}`,
		});
		return { success: false };
	} finally {
		await fsp.rm(downloadStage, { recursive: true, force: true });
		await fsp.rm(installStage, { recursive: true, force: true });
		if (extractionStage) {
			await fsp.rm(extractionStage, { recursive: true, force: true });
		}
	}

	addValue("PATH", depFolder);
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
	fs.rmSync(depFolder, { recursive: true, force: true });
	removeValue(depFolder, "PATH");
	logger.info(`${depName} uninstalled successfully`);
}
