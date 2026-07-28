import { randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { checkDependencies } from "@/server/scripts/dependencies/dependencies";
import executeInstallation from "@/server/scripts/execute";
import { checkSystem } from "@/server/scripts/system";
import { verifyAndRecordRemoteManifest } from "@/server/scripts/trust";
import {
	resolveCanonicalAppPath,
	validateAppId,
} from "@/server/scripts/utils/paths";
import { supabase } from "@/server/utils/database";
import logger from "@/server/utils/logger";
import type { Server } from "socket.io";

export async function getScripts(id: string, io: Server, force?: boolean) {
	if (!supabase) {
		logger.warn(
			"Supabase not initialized (no .env). Continuing without DB features.",
		);
	}
	try {
		const response = await fetch(
			`https://api-getdione-app.deeivihh.workers.dev/v1/scripts?id=${id}&limit=1`,
			{
				headers: {
					...(process.env.DIONE_API_KEY
						? { Authorization: `Bearer ${process.env.DIONE_API_KEY}` }
						: {}),
				},
			},
		);
		const json = await response.json();
		const data = json[0];
		if (!data || data.length === 0) {
			io.to(id).emit("installUpdate", {
				type: "log",
				content: "ERROR: Script not found\n",
			});
			io.to(id).emit("installUpdate", {
				type: "status",
				status: "error",
				content: "Error detected",
			});
			return null;
		}

		const appId = validateAppId(data.name);
		let saveDirectory = await resolveCanonicalAppPath(appId);
		const script_url = data.script_url;
		const commitHashes = data.commit_hash || {};
		const commit = commitHashes[data.version] || "";
		const trustMetadata = {
			manifestSha256: data.manifest_sha256,
			publisherKeyId: data.publisher_key_id,
			publisherSignature: data.publisher_signature,
			sourceUrl: script_url,
			commit,
		};
		try {
			// create app stuff
			const existing = await fs.promises.lstat(saveDirectory).catch(() => null);
			if (!existing) await fs.promises.mkdir(saveDirectory);
			else
				saveDirectory = await resolveCanonicalAppPath(appId, {
					mustExist: true,
				});
			const outputFilePath = path.join(saveDirectory, "dione.json");
			// download dione.json
			await downloadFile(
				script_url,
				outputFilePath,
				io,
				id,
				trustMetadata,
				force,
			);
		} catch (error) {
			io.to(id).emit("installUpdate", {
				type: "log",
				content: `ERROR: Error creating apps directory: ${error}\n`,
			});
			io.to(id).emit("installUpdate", {
				type: "status",
				status: "error",
				content: "Error detected",
			});
			logger.error("Error creating apps directory:", error);
			throw error;
		}
		return undefined;
	} catch (error) {
		io.to(id).emit("installUpdate", {
			type: "log",
			content: `ERROR: ${error}\n`,
		});
		io.to(id).emit("installUpdate", {
			type: "status",
			status: "error",
			content: "Error detected",
		});
		logger.error(`Error downloading script: ${error}`);
		throw error;
	}
}

export function extractInfo(url: string): {
	repo: string;
	branch?: string;
	filePath?: string;
} {
	const parsedUrl = new URL(url);
	if (
		parsedUrl.protocol !== "https:" ||
		!(["github.com", "raw.githubusercontent.com"] as const).includes(
			parsedUrl.hostname as "github.com" | "raw.githubusercontent.com",
		)
	) {
		throw new Error("Only approved GitHub HTTPS manifest URLs are supported");
	}
	// extract owner and name
	const repoRegex =
		/(?:github\.com|raw\.githubusercontent\.com)\/([^\/]+\/[^\/]+)/;
	const repoMatch = url.match(repoRegex);

	if (!repoMatch?.[1]) {
		throw new Error("No valid GitHub repository found");
	}

	const repo = repoMatch[1];

	// check if URL contains branch and file path information
	const fullPathRegex = /github\.com\/([^\/]+\/[^\/]+)\/blob\/([^\/]+)\/(.+)/;
	const fullPathMatch = url.match(fullPathRegex);

	if (fullPathMatch) {
		// return repo, branch and file path if available
		return {
			repo,
			branch: fullPathMatch[2],
			filePath: fullPathMatch[3],
		};
	}
	const rawPathMatch = url.match(
		/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)/,
	);
	if (rawPathMatch) return { repo, filePath: rawPathMatch[1] };

	// return just the repo if no branch/file info
	return { repo };
}

export function downloadFile(
	GITHUB_URL: string,
	FILE_PATH: string,
	io: Server,
	id: string,
	trustMetadata: {
		manifestSha256: string;
		publisherKeyId: string;
		publisherSignature: string;
		sourceUrl: string;
		commit: string;
	},
	force?: boolean,
) {
	const repoInfo = extractInfo(GITHUB_URL);
	const { commit } = trustMetadata;
	if (!/^[a-f0-9]{40}$/i.test(commit)) {
		return Promise.reject(
			new Error(
				"Remote install refused: publisher metadata must pin an immutable 40-character git commit",
			),
		);
	}

	io.to(id).emit("installUpdate", {
		type: "log",
		content: `Downloading script from ${repoInfo.repo}\n`,
	});
	io.to(id).emit("installUpdate", {
		type: "status",
		status: "pending",
		content: "Downloading script...",
	});

	let url: string;
	if (GITHUB_URL.includes("raw.githubusercontent.com")) {
		url = `https://raw.githubusercontent.com/${repoInfo.repo}/${commit}/${repoInfo.filePath || "dione.json"}`;
	} else {
		try {
			if (repoInfo.branch && repoInfo.filePath) {
				// if URL contains branch and file path, use them
				url = `https://raw.githubusercontent.com/${repoInfo.repo}/${commit}/${repoInfo.filePath}`;
			} else {
				// default to main branch and dione.json if not specified
				url = `https://raw.githubusercontent.com/${repoInfo.repo}/${commit}/dione.json`;
			}
		} catch (error: any) {
			io.to(id).emit("installUpdate", {
				type: "log",
				content: `ERROR: Invalid GitHub URL: ${error.message}\n`,
			});
			io.to(id).emit("installUpdate", {
				type: "status",
				status: "error",
				content: "Error detected",
			});
			logger.error(`Invalid GitHub URL: ${error.message}`);
			return Promise.reject(error);
		}
	}

	io.to(id).emit("installUpdate", {
		type: "log",
		content: `Downloading script with commit ${commit}...\n`,
	});

	const temporaryPath = path.join(
		path.dirname(FILE_PATH),
		`.dione.json.${randomUUID()}.download`,
	);
	const file = fs.createWriteStream(temporaryPath, {
		flags: "wx",
		mode: 0o600,
	});

	return new Promise<void>((resolve, reject) => {
		const request = https.get(url, async (response) => {
			if (response.statusCode === 200) {
				try {
					await pipeline(response, file);
					await verifyAndRecordRemoteManifest(temporaryPath, trustMetadata);
					const destination = await fs.promises
						.lstat(FILE_PATH)
						.catch(() => null);
					if (destination?.isSymbolicLink()) {
						throw new Error("Manifest destination symlink rejected");
					}
					if (destination) await fs.promises.rm(FILE_PATH);
					await fs.promises.rename(temporaryPath, FILE_PATH);
					io.to(id).emit("installUpdate", {
						type: "log",
						content: "Script downloaded successfully.\n",
					});
					io.to(id).emit("installUpdate", {
						type: "status",
						status: "success",
						content: "Script downloaded",
					});

					const systemCheck =
						force === true
							? { success: true, reasons: [] }
							: await checkSystem(FILE_PATH);
					if (systemCheck.success === false) {
						io.to(id).emit("installUpdate", {
							type: "log",
							content: "System requirements not met.\n",
						});
						io.to(id).emit("installUpdate", {
							type: "status",
							status: "error",
							content: "Error detected",
						});
						io.to(id).emit("notSupported", {
							reasons: systemCheck.reasons,
						});
						resolve();
						return;
					}

					io.to(id).emit("installUpdate", {
						type: "log",
						content: "All system requirements are met.\n",
					});

					const result = await checkDependencies(FILE_PATH);
					logger.info(`RESULT: ${JSON.stringify(result)}`);
					if (result.success) {
						io.to(id).emit("installUpdate", {
							type: "log",
							content: "All required dependencies are installed.\n",
						});
						io.to(id).emit("installUpdate", {
							type: "status",
							status: "success",
							content: "Dependencies installed",
						});
						io.to(id).emit("enableStop");
						await executeInstallation(FILE_PATH, io, id);
					} else if (result.error) {
						io.to(id).emit("installUpdate", {
							type: "log",
							content:
								"We have not been able to read the configuration file due to an error, check that Dione.json is well formulated as JSON.\n",
						});
						io.to(id).emit("installUpdate", {
							type: "status",
							status: "error",
							content: "Error detected",
						});
					} else {
						io.to(id).emit("missingDeps", result.missing);
						const depsList = result.missing.map((dep) => dep.name).join(", ");
						io.to(id).emit("installUpdate", {
							type: "log",
							content: `Installing dependencies: ${depsList}\n`,
						});
						io.to(id).emit("installUpdate", {
							type: "status",
							status: "pending",
							content: "Installing dependencies...",
						});
					}
					resolve();
				} catch (error) {
					await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
					reject(error);
				}
			} else {
				response.resume();
				file.destroy();
				await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
				logger.error(`Error downloading script: ${response.statusCode}`);
				io.to(id).emit("installUpdate", {
					type: "log",
					content: `ERROR: Error downloading script, status code: ${response.statusCode}\n`,
				});
				io.to(id).emit("installUpdate", {
					type: "status",
					status: "error",
					content: "Error detected",
				});
				resolve();
			}
		});

		request.on("error", async (error) => {
			file.destroy();
			await fs.promises.rm(FILE_PATH, { force: true }).catch(() => {});
			logger.error("Error in request:", error);
			io.to(id).emit("installUpdate", {
				type: "log",
				content: `ERROR: Error in request: ${error.message}\n`,
			});
			io.to(id).emit("installUpdate", {
				type: "status",
				status: "error",
				content: "Error detected",
			});
			resolve();
		});
	});
}
