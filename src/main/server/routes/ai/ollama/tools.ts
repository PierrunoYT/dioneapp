import fs from "node:fs";
import path from "node:path";
import getAllScripts from "@/server/scripts/installed";
import {
	getAppsRoot,
	resolveCanonicalAppPath,
	validateAppId,
} from "@/server/scripts/utils/paths";
import { catalogApiEnabled } from "@/server/utils/features";
import logger from "@/server/utils/logger";

const MAX_TOOL_FILE_BYTES = 32 * 1024;
const ALLOWED_TOOL_EXTENSIONS = new Set([
	".c",
	".cpp",
	".css",
	".go",
	".h",
	".html",
	".java",
	".js",
	".json",
	".jsx",
	".md",
	".py",
	".rs",
	".sh",
	".toml",
	".ts",
	".tsx",
	".txt",
	".yaml",
	".yml",
]);
const SENSITIVE_FILE_NAMES =
	/^(?:\.env(?:\..*)?|\.gitconfig|\.npmrc|\.netrc|id_(?:rsa|dsa|ecdsa|ed25519)|authorized_keys|credentials|secrets?\.(?:json|ya?ml|toml))$/i;

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

async function findProjectByServerId(projectId: string) {
	const id = validateAppId(projectId);
	const entries = await fs.promises.readdir(getAppsRoot(), {
		withFileTypes: true,
	});
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
		const root = await resolveCanonicalAppPath(entry.name, { mustExist: true });
		for (const metadataName of ["app_info.json", "dione.json"]) {
			try {
				const metadata = JSON.parse(
					await fs.promises.readFile(path.join(root, metadataName), "utf8"),
				);
				const ids = [metadata?.id, metadata?.appId, metadata?.app_id];
				if (ids.some((value) => value === id)) return root;
			} catch {
				// Missing or invalid metadata does not make a directory selectable.
			}
		}
	}
	throw new Error("Project not found");
}

export async function read_file(
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
		const dir = await findProjectByServerId(project);
		if (path.isAbsolute(file) || file.includes("\0")) {
			return "Error: Requested file escapes the project directory.";
		}
		const parts = file.replace(/\\/g, "/").split("/");
		if (parts.some((part) => !part || part === "." || part === "..")) {
			return "Error: Invalid file path.";
		}
		if (parts.some((part) => SENSITIVE_FILE_NAMES.test(part))) {
			return "Error: Sensitive files cannot be read by the AI tool.";
		}
		if (!ALLOWED_TOOL_EXTENSIONS.has(path.extname(file).toLowerCase())) {
			return "Error: File type is not allowed for the AI tool.";
		}

		let current = dir;
		for (const part of parts) {
			current = path.join(current, part);
			const stats = await fs.promises.lstat(current);
			if (stats.isSymbolicLink()) throw new Error("Symbolic link rejected");
		}
		const canonical = await fs.promises.realpath(current);
		const relative = path.relative(dir, canonical);
		if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
			throw new Error("File escapes project");
		}
		const handle = await fs.promises.open(
			canonical,
			fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
		);
		try {
			const stats = await handle.stat();
			if (!stats.isFile()) return "Error: Requested path is not a file.";
			if (stats.size > MAX_TOOL_FILE_BYTES) {
				return "Error: File exceeds the AI tool size limit.";
			}
			logger.ai("AI tool read_file outcome=success");
			return await handle.readFile({ encoding: "utf8" });
		} finally {
			await handle.close();
		}
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
	// Browsing the catalog needs the hosted API. With it disabled the tool
	// returns nothing so the assistant answers from local apps instead.
	if (!catalogApiEnabled) {
		logger.info("Catalog API disabled, get_latest_apps returning no results");
		return [];
	}
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
				return `Dione API error: ${response.statusText}`;
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
	if (!catalogApiEnabled) {
		logger.info("Catalog API disabled, get_app_by_name returning no results");
		return [];
	}
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
