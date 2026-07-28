import { execFile, spawn } from "node:child_process";
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
} from "@/server/scripts/dependencies/utils/verified-artifact";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

const depName = "conda";

function condaArtifact(
	name: string,
	version: string,
	sha256: string,
): ArtifactMetadata {
	return {
		id: `miniconda-${name}`,
		version,
		url: `https://repo.anaconda.com/miniconda/${name}`,
		allowedHosts: ["repo.anaconda.com"],
		verification: { type: "sha256", sha256 },
		maxDownloadBytes: 300 * 1024 * 1024,
	};
}

// Digests are from the SHA256 column of Anaconda's versioned Miniconda archive.
const artifacts: Record<string, Record<string, ArtifactMetadata>> = {
	linux: {
		amd64: condaArtifact(
			"Miniconda3-py313_26.5.3-1-Linux-x86_64.sh",
			"py313_26.5.3-1",
			"7358a5961dc6a4941d087281cd70313728fcc68695735e18a337321bc31c7f51",
		),
		arm64: condaArtifact(
			"Miniconda3-py313_26.5.3-1-Linux-aarch64.sh",
			"py313_26.5.3-1",
			"4eaf1f2d83ede3ad010afa6ad19bef69893ca4667ba5996f51efb3080c08a70d",
		),
	},
	macos: {
		amd64: condaArtifact(
			"Miniconda3-py313_25.7.0-2-MacOSX-x86_64.sh",
			"py313_25.7.0-2",
			"9c88674b1a839eeb4cff006df397a05ea7d896472318fd84b7070278f9653dc6",
		),
		arm64: condaArtifact(
			"Miniconda3-py313_26.5.3-1-MacOSX-arm64.sh",
			"py313_26.5.3-1",
			"c73b91d59c872f472d7a21dadaf0cc70dcff1fadf5bd98200bd15341be2bcbd0",
		),
	},
	windows: {
		amd64: condaArtifact(
			"Miniconda3-py313_26.5.3-1-Windows-x86_64.exe",
			"py313_26.5.3-1",
			"c229a161e9fad48fd7d2c701da363e6a307b233eba379cd967bc26aa2cb3fa68",
		),
		x86: condaArtifact(
			"Miniconda3-py39_4.12.0-Windows-x86.exe",
			"py39_4.12.0",
			"4fb64e6c9c28b88beab16994bfba4829110ea3145baa60bda5344174ab65d462",
		),
	},
};

async function runProcess(
	file: string,
	args: string[],
	cwd: string,
	signal?: AbortSignal,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(file, args, {
			cwd,
			env: getAllValues(),
			shell: false,
			windowsHide: true,
			signal,
		});
		let stderr = "";
		child.stderr.on("data", (data) => {
			if (stderr.length < 32_768) stderr += data.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else
				reject(
					new Error(
						`${path.basename(file)} exited with code ${code}: ${stderr}`,
					),
				);
		});
	});
}

export async function isInstalled(
	binFolder: string,
): Promise<{ installed: boolean; reason: string; version?: string }> {
	const depFolder = path.join(binFolder, depName);
	if (!fs.existsSync(depFolder) || fs.readdirSync(depFolder).length === 0) {
		return { installed: false, reason: "not-installed" };
	}
	try {
		const output = await new Promise<string>((resolve, reject) => {
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
		return {
			installed: true,
			reason: "installed",
			version: output.match(/conda\s+(\d+\.\d+\.\d+)/)?.[1],
		};
	} catch {
		return { installed: false, reason: "error" };
	}
}

export async function install(
	binFolder: string,
	id: string,
	io: Server,
	requiredVersion?: string,
	signal?: AbortSignal,
): Promise<{ success: boolean }> {
	const installed = await isInstalled(binFolder);
	if (installed.installed) {
		if (
			requiredVersion &&
			requiredVersion !== "latest" &&
			installed.version !== requiredVersion
		) {
			return update(binFolder, id, io, requiredVersion, signal);
		}
		return { success: true };
	}
	if (signal?.aborted) return { success: false };

	const platform = getOS();
	const arch = getArch();
	const artifact = artifacts[platform]?.[arch];
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content: `No verified Miniconda artifact is available for ${platform} (${arch}).`,
		});
		return { success: false };
	}

	const depFolder = path.join(binFolder, depName);
	const staging = await createPrivateStagingDirectory(
		path.join(binFolder, "temp"),
		"conda-installer-",
	);
	const installerPath = path.join(
		staging,
		path.basename(new URL(artifact.url).pathname),
	);
	try {
		io.to(id).emit("installDep", {
			type: "log",
			content: `Downloading and verifying Miniconda ${artifact.version} for ${platform} (${arch})...`,
		});
		await downloadVerifiedArtifact(artifact, installerPath, { signal });
		if (platform !== "windows") await fsp.chmod(installerPath, 0o700);
		await fsp.mkdir(depFolder, { recursive: true });
		const installerArgs =
			platform === "windows"
				? [
						"/InstallationType=JustMe",
						"/RegisterPython=0",
						"/NoShortcuts=1",
						"/S",
						`/D=${depFolder}`,
					]
				: ["-b", "-u", "-p", depFolder];
		await runProcess(installerPath, installerArgs, staging, signal);

		const condaExecutable =
			platform === "windows"
				? path.join(depFolder, "Scripts", "conda.exe")
				: path.join(depFolder, "bin", "conda");
		await runProcess(
			condaExecutable,
			["tos", "accept", "--channel", "main"],
			depFolder,
			signal,
		);
		await runProcess(condaExecutable, ["init", "--all"], depFolder, signal);
	} catch (error) {
		if (signal?.aborted) return { success: false };
		logger.error(`Secure installation failed for ${depName}:`, error);
		io.to(id).emit("installDep", {
			type: "error",
			content: `Secure installation failed for ${depName}: ${String(error)}`,
		});
		return { success: false };
	} finally {
		await fsp.rm(staging, { recursive: true, force: true });
	}

	const cacheDir = path.join(binFolder, "cache", depName);
	const condaExecutable =
		platform === "windows"
			? path.join(depFolder, "Scripts", "conda.exe")
			: path.join(depFolder, "bin", "conda");
	addValue("CONDA_PKGS_DIRS", cacheDir);
	addValue("CONDA_ENVS_PATH", cacheDir);
	addValue("CONDA_EXE", condaExecutable);
	addValue("PATH", depFolder);
	addValue("PATH", path.dirname(condaExecutable));
	addValue("CONDA_ROOT", depFolder);
	addValue("CONDARC", path.join(depFolder, ".condarc"));
	addValue("CONDA_NO_USER_CONFIG", "1");
	addValue("PIP_CACHE_DIR", path.join(binFolder, "cache", "pip"));
	io.to(id).emit("installDep", {
		type: "log",
		content: `${depName} installed successfully`,
	});
	return { success: true };
}

export async function update(
	binFolder: string,
	id: string,
	io: Server,
	requiredVersion?: string,
	signal?: AbortSignal,
): Promise<{ success: boolean }> {
	const depFolder = path.join(binFolder, depName);
	if (!fs.existsSync(depFolder) || fs.readdirSync(depFolder).length === 0) {
		io.to(id).emit("installDep", {
			type: "error",
			content: `${depName} is not installed. Please install it first.`,
		});
		return { success: false };
	}
	try {
		await runProcess(
			process.platform === "win32"
				? path.join(depFolder, "Scripts", "conda.exe")
				: path.join(depFolder, "bin", "conda"),
			["install", "-y", `conda=${requiredVersion}`],
			depFolder,
			signal,
		);
		io.to(id).emit("installDep", {
			type: "log",
			content: `${depName} updated successfully.`,
		});
		return { success: true };
	} catch (error) {
		if (signal?.aborted) return { success: false };
		logger.error(`Error during ${depName} update:`, error);
		io.to(id).emit("installDep", {
			type: "error",
			content: `Error updating ${depName}: ${String(error)}`,
		});
		return { success: false };
	}
}

export async function uninstall(binFolder: string): Promise<void> {
	const depFolder = path.join(binFolder, depName);
	const cacheDir = path.join(binFolder, "cache", depName);
	const condaExecutable =
		getOS() === "windows"
			? path.join(depFolder, "Scripts", "conda.exe")
			: path.join(depFolder, "bin", "conda");
	if (!fs.existsSync(depFolder)) {
		throw new Error(`Dependency ${depName} is not installed`);
	}
	await fsp.rm(cacheDir, { recursive: true, force: true });
	await fsp.rm(depFolder, { recursive: true, force: true });
	removeValue(depFolder, "PATH");
	removeValue(path.join(depFolder, "Scripts"), "PATH");
	removeValue(path.join(depFolder, "bin"), "PATH");
	removeValue(cacheDir, "CONDA_PKGS_DIRS");
	removeValue(condaExecutable, "CONDA_EXE");
	removeValue(depFolder, "CONDA_ROOT");
	removeValue(cacheDir, "CONDA_ENVS_PATH");
	removeValue("1", "CONDA_NO_USER_CONFIG");
	removeValue(path.join(depFolder, ".condarc"), "CONDARC");
	logger.info(`${depName} uninstalled successfully`);
}
