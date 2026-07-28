import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { checkDependencies } from "@/server/scripts/dependencies/dependencies";
import executeInstallation from "@/server/scripts/execute";
import { checkSystem } from "@/server/scripts/system";
import { resolveScriptPaths } from "@/server/scripts/utils/paths";
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

		const { workingDir: saveDirectory } = resolveScriptPaths(data.name);
		const script_url = data.script_url;
		const commit_hashes = data.commit_hash || {};
		const commit = commit_hashes[data.version] || "";
		try {
			// create app stuff
			await fs.promises.mkdir(saveDirectory, { recursive: true });
			const outputFilePath = path.join(saveDirectory, "dione.json");
			// download dione.json
			await downloadFile(script_url, outputFilePath, io, id, commit, force);
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
		}
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
	}
	return null;
}

export function extractInfo(url: string): {
	repo: string;
	branch?: string;
	filePath?: string;
} {
	// extract owner and name
	const repoRegex = /github\.com\/([^\/]+\/[^\/]+)/;
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

	// return just the repo if no branch/file info
	return { repo };
}

export function downloadFile(
	GITHUB_URL: string,
	FILE_PATH: string,
	io: Server,
	id: string,
	commit: string,
	force?: boolean,
) {
	const repoInfo = extractInfo(GITHUB_URL);

	io.to(id).emit("installUpdate", {
		type: "log",
		content: `Downloading script from ${repoInfo.repo}\n`,
	});
	io.to(id).emit("installUpdate", {
		type: "status",
		status: "pending",
		content: "Downloading script...",
	});

	let url = GITHUB_URL;
	if (!GITHUB_URL.includes("raw.githubusercontent.com")) {
		try {
			if (repoInfo.branch && repoInfo.filePath) {
				// if URL contains branch and file path, use them
				url = `https://raw.githubusercontent.com/${repoInfo.repo}/${repoInfo.branch}/${repoInfo.filePath}`;
			} else {
				// default to main branch and dione.json if not specified
				url = `https://raw.githubusercontent.com/${repoInfo.repo}/main/dione.json`;
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
			return Promise.resolve();
		}
	}

	if (commit) {
		io.to(id).emit("installUpdate", {
			type: "log",
			content: `Downloading script with commit ${commit}...\n`,
		});
		url += `?ref=${commit}`;
	}

	const file = fs.createWriteStream(FILE_PATH);

	return new Promise<void>((resolve, reject) => {
		const request = https.get(url, async (response) => {
			if (response.statusCode === 200) {
				try {
					await pipeline(response, file);
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
					await fs.promises.rm(FILE_PATH, { force: true }).catch(() => {});
					reject(error);
				}
			} else {
				response.resume();
				file.destroy();
				await fs.promises.rm(FILE_PATH, { force: true }).catch(() => {});
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
