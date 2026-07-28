import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
	addValue,
	getAllValues,
	getValue,
	removeKey,
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

const depName = "cuda";
const cudaVersion = "12.1";
const expectedWindowsPath = `C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v${cudaVersion}`;
const expectedLinuxPath = `/usr/local/cuda-${cudaVersion}`;
const ownershipManifestName = "cuda-ownership.json";

interface CudaOwnershipManifest {
	version: 1;
	installationPath: string;
	platform: string;
	cudaVersion: string;
	createdAt: string;
}

function getCudaArtifact(
	platform: string,
	arch: string,
): ArtifactMetadata | undefined {
	if (platform === "windows" && arch === "amd64") {
		return {
			id: "cuda_12.1.0_531.14_windows.exe",
			version: "12.1.0",
			url: "https://developer.download.nvidia.com/compute/cuda/12.1.0/local_installers/cuda_12.1.0_531.14_windows.exe",
			allowedHosts: ["developer.download.nvidia.com"],
			verification: {
				type: "authenticode",
				publishers: ["NVIDIA Corporation"],
			},
			maxDownloadBytes: 5 * 1024 * 1024 * 1024,
		};
	}
	return undefined;
}

export async function isInstalled(
	_binFolder: string,
): Promise<{ installed: boolean; reason: string }> {
	const platform = getOS();
	const ENVIRONMENT = getAllValues();
	let cudaPath: string;

	if (platform === "windows") {
		cudaPath = expectedWindowsPath;
	} else if (platform === "linux") {
		cudaPath = expectedLinuxPath;
		try {
			await new Promise<void>((resolve, reject) => {
				execFile("nvcc", ["--version"], { env: ENVIRONMENT }, (error) => {
					if (!error) resolve();
					else reject(error);
				});
			});

			return { installed: true, reason: "nvcc-found-in-path" };
		} catch {}
	} else {
		return { installed: false, reason: "unsupported-platform" };
	}

	if (fs.existsSync(cudaPath)) {
		if (!ENVIRONMENT.CUDA_HOME) {
			if (platform === "windows") {
				addValue("PATH", expectedWindowsPath);
				addValue("PATH", path.join(expectedWindowsPath, "bin"));
				addValue("CUDA_HOME", expectedWindowsPath);
				addValue("CUDA_PATH", expectedWindowsPath);
			} else if (platform === "linux") {
				addValue("PATH", path.join(expectedLinuxPath, "bin"));
				addValue("CUDA_HOME", expectedLinuxPath);
				addValue("CUDA_PATH", expectedLinuxPath);
			}
		}
		return { installed: true, reason: `path-exists-at-${cudaPath}` };
	}

	return { installed: false, reason: `path-not-found-${cudaPath}` };
}

export async function install(
	binFolder: string,
	id: string,
	io: Server,
	_required_v?: string,
	signal?: AbortSignal,
): Promise<{ success: boolean }> {
	const tempDir = path.join(binFolder, "temp");
	const platform = getOS();
	const arch = getArch();
	const managedPath =
		platform === "windows" ? expectedWindowsPath : expectedLinuxPath;
	const pathExistedBeforeInstall = fs.existsSync(managedPath);

	if (signal?.aborted) return { success: false };

	const artifact = getCudaArtifact(platform, arch);
	if (!artifact) {
		io.to(id).emit("installDep", {
			type: "error",
			content:
				platform === "linux"
					? "CUDA runfile installation is disabled on Linux because NVIDIA publishes only an MD5 value for this artifact and no verifiable vendor signature."
					: `No verified artifact is available for ${depName} ${cudaVersion} on ${platform} (${arch}).`,
		});
		return { success: false };
	}

	const stagingDirectory = await createPrivateStagingDirectory(
		tempDir,
		"cuda-installer-",
	);
	const installerFilepath = path.join(stagingDirectory, artifact.id);

	io.to(id).emit("installDep", {
		type: "log",
		content: `Downloading ${depName} ${cudaVersion} (~3GB). This may take a while...`,
	});

	try {
		await downloadVerifiedArtifact(artifact, installerFilepath, { signal });

		io.to(id).emit("installDep", {
			type: "log",
			content: `${depName} installer downloaded and signature-verified successfully.`,
		});
	} catch (error: any) {
		await fsp.rm(stagingDirectory, { recursive: true, force: true });
		if (
			signal?.aborted ||
			error.message === "Aborted" ||
			error.name === "AbortError"
		) {
			return { success: false };
		}
		logger.error(`Error downloading installer for ${depName}:`, error);
		io.to(id).emit("installDep", {
			type: "error",
			content: `Error downloading installer for ${depName}: ${error}`,
		});
		return { success: false };
	}

	if (signal?.aborted) {
		await fsp.rm(stagingDirectory, { recursive: true, force: true });
		return { success: false };
	}

	io.to(id).emit("installDep", {
		type: "log",
		content: "Running CUDA installer...",
	});

	let command: { file: string; args: string[] };

	if (platform === "windows") {
		command = {
			file: installerFilepath,
			args: ["-s", "-n", "nvcc_12.1", "cudart_12.1"],
		};
	} else if (platform === "linux") {
		command = {
			file: "sudo",
			args: ["sh", installerFilepath, "--silent", "--toolkit"],
		};
	} else {
		io.to(id).emit("installDep", {
			type: "error",
			content: `Unsupported platform for CUDA installation: ${platform}`,
		});
		return { success: false };
	}

	io.to(id).emit("installDep", {
		type: "log",
		content: `Executing: ${command.file} ${command.args.join(" ")}`,
	});

	const ENVIRONMENT = getAllValues();
	const spawnOptions = {
		shell: false,
		windowsHide: true,
		env: ENVIRONMENT,
		signal,
	};

	try {
		await new Promise<void>((resolve, reject) => {
			if (signal?.aborted) return reject(new Error("Aborted"));
			let child: ReturnType<typeof spawn>;

			if (platform === "windows") {
				const installerPathEscaped = installerFilepath.replace(/'/g, "''");
				const argumentList = command.args
					.map((argument) => `'${argument.replace(/'/g, "''")}'`)
					.join(",");
				const psCommand = `Start-Process -FilePath '${installerPathEscaped}' -ArgumentList ${argumentList} -Verb RunAs -Wait -PassThru`;

				child = spawn(
					"powershell",
					[
						"-NoLogo",
						"-NoProfile",
						"-NonInteractive",
						"-ExecutionPolicy",
						"Bypass",
						"-Command",
						psCommand,
					],
					{ windowsHide: true, env: ENVIRONMENT, signal },
				);
			} else {
				child = spawn(command.file, command.args, spawnOptions);
			}

			if (child.stdout) {
				child.stdout.on("data", (data) => {
					io.to(id).emit("installDep", {
						type: "log",
						content: data.toString(),
					});
				});
			}

			if (child.stderr) {
				child.stderr.on("data", (data) => {
					io.to(id).emit("installDep", {
						type: "error",
						content: `Installer Error: ${data.toString()}`,
					});
					logger.error(`Error during CUDA installation: ${data.toString()}`);
				});
			}

			child.on("close", (code) => {
				if (signal?.aborted) return reject(new Error("Aborted"));
				if (code === 0) {
					io.to(id).emit("installDep", {
						type: "log",
						content: `CUDA ${cudaVersion} installation finished.`,
					});

					if (platform === "windows") {
						addValue("PATH", expectedWindowsPath);
						addValue("PATH", path.join(expectedWindowsPath, "bin"));
						addValue("CUDA_HOME", expectedWindowsPath);
						addValue("CUDA_PATH", expectedWindowsPath);
					} else if (platform === "linux") {
						addValue("PATH", path.join(expectedLinuxPath, "bin"));
						addValue("CUDA_HOME", expectedLinuxPath);
						addValue("CUDA_PATH", expectedLinuxPath);
					}

					resolve();
				} else {
					reject(new Error(`CUDA installer exited with code ${code}.`));
				}
			});

			child.on("error", (err) => {
				if (signal?.aborted) return reject(new Error("Aborted"));
				reject(err);
			});
		});
	} catch (error: any) {
		await fsp.rm(stagingDirectory, { recursive: true, force: true });
		if (
			signal?.aborted ||
			error.message === "Aborted" ||
			error.name === "AbortError"
		) {
			return { success: false };
		}
		logger.error("Error running CUDA installer:", error);
		io.to(id).emit("installDep", {
			type: "error",
			content: `Fatal error during CUDA installation: ${error}`,
		});
		return { success: false };
	}
	await fsp.rm(stagingDirectory, { recursive: true, force: true });

	if (!pathExistedBeforeInstall && fs.existsSync(managedPath)) {
		const manifest: CudaOwnershipManifest = {
			version: 1,
			installationPath: managedPath,
			platform,
			cudaVersion,
			createdAt: new Date().toISOString(),
		};
		await fsp.writeFile(
			path.join(binFolder, ownershipManifestName),
			JSON.stringify(manifest, null, 2),
			{ encoding: "utf8", flag: "wx", mode: 0o600 },
		);
	}

	return { success: true };
}

export async function uninstall(binFolder: string): Promise<void> {
	const platform = getOS();
	let cudaPath: string | undefined;

	if (platform === "windows") {
		cudaPath = expectedWindowsPath;
	} else if (platform === "linux") {
		cudaPath = expectedLinuxPath;
	} else {
		logger.warn("Uninstall of CUDA not supported on this platform via script.");
		return;
	}

	const manifestPath = path.join(binFolder, ownershipManifestName);
	let manifest: CudaOwnershipManifest;
	try {
		manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
	} catch {
		logger.warn(
			"Refusing to remove CUDA: no valid Dione ownership manifest exists.",
		);
		return;
	}
	if (
		manifest.version !== 1 ||
		manifest.platform !== platform ||
		manifest.cudaVersion !== cudaVersion ||
		path.resolve(manifest.installationPath) !== path.resolve(cudaPath)
	) {
		logger.warn(
			"Refusing to remove CUDA: ownership manifest does not match this installation.",
		);
		return;
	}

	if (fs.existsSync(cudaPath)) {
		logger.warn(`Removing CUDA installation directory: ${cudaPath}`);
		await fsp.rm(cudaPath, { recursive: true, force: true });
		logger.info("CUDA directory removed successfully.");
		if (platform === "windows") {
			removeValue(expectedWindowsPath, "PATH");
			removeValue(path.join(expectedWindowsPath, "bin"), "PATH");
			if (getValue("CUDA_HOME") === expectedWindowsPath) removeKey("CUDA_HOME");
			if (getValue("CUDA_PATH") === expectedWindowsPath) removeKey("CUDA_PATH");
		} else if (platform === "linux") {
			removeValue(path.join(expectedLinuxPath, "bin"), "PATH");
			if (getValue("CUDA_HOME") === expectedLinuxPath) removeKey("CUDA_HOME");
			if (getValue("CUDA_PATH") === expectedLinuxPath) removeKey("CUDA_PATH");
		}

		await fsp.rm(manifestPath, { force: true });
		logger.info(`Environment variables for CUDA ${cudaVersion} removed.`);
	}
}
