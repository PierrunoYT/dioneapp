import fs from "node:fs";
import path from "node:path";
import getAllScripts from "@/server/scripts/installed";
import { resolveScriptPaths } from "@/server/scripts/utils/paths";
import logger from "@/server/utils/logger";

const MAX_TOOL_FILE_BYTES = 32 * 1024;

function ensureNotAborted(signal?: AbortSignal) {
	if (signal?.aborted) throw new Error("Chat request aborted");
}

function limitToolArray(values: unknown[]): unknown[] {
	const limited: unknown[] = [];
	let bytes = 2;
	for (const value of values) {
		const serialized = JSON.stringify(value);
		if (Buffer.byteLength(serialized) + bytes > MAX_TOOL_FILE_BYTES) break;
		limited.push(value);
		bytes += Buffer.byteLength(serialized) + 1;
	}
	return limited;
}

async function readBoundedText(response: Response): Promise<string> {
	if (!response.body) return "";
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		bytes += value.byteLength;
		if (bytes > MAX_TOOL_FILE_BYTES) {
			await reader.cancel();
			throw new Error("Remote tool response exceeded size limit");
		}
		text += decoder.decode(value, { stream: true });
	}
}

export function getTools(io: any, signal?: AbortSignal) {
	return {
		read_file: async ({ project, file }) => {
			return read_file(project, file, io, signal);
		},
		get_installed_apps: async () => {
			return get_installed_apps(io, signal);
		},
		get_latest_apps: async () => {
			return get_latest_apps(io, signal);
		},
		navigate_to_app: async ({ name, action }) => {
			return navigate_to_app(io, name, action, signal);
		},
	};
}

export function read_file(
	project: string,
	file: string,
	io: any,
	signal?: AbortSignal,
) {
	try {
		ensureNotAborted(signal);
		io.emit("ollama:using-tool", {
			name: "read_file",
			message: "Reading file",
		});
		if (!project || !file) {
			return "Error: Missing 'project' or 'file' parameter.";
		}

		logger.ai("AI tool read_file outcome=started");
		const dir = resolveScriptPaths(project).workingDir;
		let pathToRead = path.resolve(dir, file);
		const relative = path.relative(path.resolve(dir), pathToRead);
		if (
			relative === ".." ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative)
		) {
			return "Error: Requested file escapes the project directory.";
		}

		if (fs.existsSync(pathToRead)) {
			if (fs.statSync(pathToRead).size > MAX_TOOL_FILE_BYTES) {
				return "Error: File exceeds the AI tool size limit.";
			}
			return fs.readFileSync(pathToRead, "utf8");
		}

		// search inside subdirectories
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name, file);
			if (
				(e.isFile() && e.name === file) ||
				(e.isDirectory() && fs.existsSync(p))
			) {
				pathToRead = p;
				if (fs.statSync(pathToRead).size > MAX_TOOL_FILE_BYTES) {
					return "Error: File exceeds the AI tool size limit.";
				}
				logger.ai("AI tool read_file outcome=success");
				return fs.readFileSync(pathToRead, "utf8");
			}
		}

		logger.ai("AI tool read_file outcome=not_found");
		return `Error: File "${file}" not found in project "${project}".`;
	} catch (err: any) {
		logger.ai("AI tool read_file outcome=error");
		return "Error reading requested file.";
	}
}

export async function get_installed_apps(io: any, signal?: AbortSignal) {
	ensureNotAborted(signal);
	io.emit("ollama:using-tool", {
		name: "get_installed_apps",
		message: "Getting installed apps",
	});
	logger.ai("Getting installed apps...");
	const result = await getAllScripts(256);
	ensureNotAborted(signal);
	logger.ai(`Installed apps: ${result.length}`);
	return Buffer.byteLength(result) <= MAX_TOOL_FILE_BYTES
		? result
		: JSON.stringify({ error: "Installed app list exceeded size limit" });
}

export async function get_latest_apps(io: any, signal?: AbortSignal) {
	ensureNotAborted(signal);
	io.emit("ollama:using-tool", {
		name: "get_latest_apps",
		message: "Getting latest apps",
	});
	async function getData(page: number, limit: number) {
		try {
			const response = await fetch(
				`https://api-getdione-app.deeivihh.workers.dev/v1/scripts?order_type=desc&page=${page}&limit=${limit}&order_by=created_at`,
				{
					signal,
					headers: {
						...(process.env.DIONE_API_KEY
							? {
									Authorization: `Bearer ${process.env.DIONE_API_KEY}`,
								}
							: {}),
					},
				},
			);

			if (response.status !== 200) {
				logger.error(
					`Fetch failed: [${response.status}] ${response.statusText}`,
				);
				return "Dione API error: " + response.statusText;
			}

			let data: any = null;
			try {
				const contentType = response.headers.get("content-type") || "";
				if (contentType.includes("application/json")) {
					const text = await readBoundedText(response);
					data = JSON.parse(text);
				} else {
					const text = await readBoundedText(response);
					logger.warn(
						`Dione API returned non-JSON (${contentType || "unknown"}).`,
					);
					try {
						data = JSON.parse(text);
					} catch {
						data = [];
					}
				}
			} catch (e: any) {
				logger.error("Failed to parse explore scripts response");
				data = [];
			}

			if (data.status === 404) {
				return "Not found any apps";
			}

			const scripts = data.map((script: any) => ({
				...script,
				logo_url: script.logo_url || "no-logo",
			}));

			return limitToolArray(scripts);
		} catch (error: any) {
			logger.error("Latest apps fetch failed");
			return "An unexpected error occurred";
		}
	}

	logger.ai("Getting latest apps...");
	const result = await getData(1, 5);
	ensureNotAborted(signal);
	logger.ai(`Latest apps: ${result.length}`);
	return result;
}

export async function get_app_by_name(
	io: any,
	name: string,
	signal?: AbortSignal,
) {
	ensureNotAborted(signal);
	io.emit("ollama:using-tool", {
		name: "get_app_by_name",
		message: "Reading about an app",
	});
	const response = await fetch(
		`https://api-getdione-app.deeivihh.workers.dev/v1/scripts?q=${name}&limit=1`,
		{
			signal,
			headers: {
				...(process.env.DIONE_API_KEY
					? {
							Authorization: `Bearer ${process.env.DIONE_API_KEY}`,
						}
					: {}),
			},
		},
	);
	const text = await readBoundedText(response);
	const data = JSON.parse(text);
	logger.ai(`Found app: ${data.length}`);
	return data;
}

export async function navigate_to_app(
	io: any,
	name: string,
	action: "navigate" | "start" | "install",
	signal?: AbortSignal,
) {
	ensureNotAborted(signal);
	io.emit("ollama:using-tool", {
		name: "navigate_to_app",
		message: "Navigating to an app",
	});
	logger.ai(`AI tool navigate_to_app action=${action}`);
	const app = await get_app_by_name(io, name, signal);
	ensureNotAborted(signal);
	if (!app) {
		return "App not found";
	}
	const id = app[0].id;
	io.emit("ollama:navigate-to-app", { id, action });
	return `Navigated to app: ${name} with id ${id} and action ${action}`;
}
