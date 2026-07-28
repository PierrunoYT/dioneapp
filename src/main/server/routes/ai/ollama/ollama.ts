import { type ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { readConfig } from "@/config";
import { getSysPrompt } from "@/server/routes/ai/instructions/instructions";
import { getTools } from "@/server/routes/ai/ollama/tools";
import {
	checkOneDependency,
	installDependency,
} from "@/server/scripts/dependencies/dependencies";
import { getAllValues } from "@/server/scripts/dependencies/environment";
import { stopActiveProcess } from "@/server/scripts/process";
import logger from "@/server/utils/logger";
import { app } from "electron";
import express from "express";
import type { Server as SocketIOServer } from "socket.io";
import { randomUUID } from "node:crypto";
const { Ollama } = require("ollama");

let activeProcess: ChildProcess | null = null;

const OLLAMA_URL = "http://localhost:11434";
const SAFE_DEFAULT_MODELS = new Set(["gemma3:12b"]);
const MAX_JSON_BYTES = 256 * 1024;
const MAX_PROMPT_BYTES = 16 * 1024;
const MAX_CONTEXT_BYTES = 96 * 1024;
const MAX_WORKSPACE_BYTES = 64 * 1024;
const MAX_HISTORY_MESSAGES = 40;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_HISTORY_BYTES = 128 * 1024;
const MAX_TOOL_ITERATIONS = 5;
const MAX_TOOL_OUTPUT_BYTES = 32 * 1024;
const MAX_OUTPUT_TOKENS = 2048;
const CHAT_TIMEOUT_MS = 120_000;
const PULL_TIMEOUT_MS = 30 * 60_000;
const MAX_CHAT_CONCURRENCY = 1;
const MAX_PULL_CONCURRENCY = 1;
const MODEL_STORAGE_RESERVE_BYTES = 5 * 1024 ** 3;
const MAX_PULLS_PER_HOUR = 2;
const MODEL_NAME =
	/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}(?::[a-zA-Z0-9._-]{1,64})?$/;
let activeChats = 0;
let activePulls = 0;
let supportedModels = new Set(SAFE_DEFAULT_MODELS);
let recentPulls: number[] = [];

const byteLength = (value: unknown) =>
	Buffer.byteLength(
		typeof value === "string" ? value : JSON.stringify(value ?? null),
	);

function safeError(error: unknown) {
	const name = error instanceof Error ? error.name.slice(0, 40) : "Error";
	const message = error instanceof Error ? error.message : "Unknown error";
	const category = /abort|timeout/i.test(message)
		? "timeout_or_abort"
		: /not found/i.test(message)
			? "not_found"
			: "upstream_error";
	return { name, category };
}

function extractSupportedModels(data: any): Set<string> {
	const result = new Set(SAFE_DEFAULT_MODELS);
	const groups = data?.models;
	if (groups && typeof groups === "object") {
		for (const group of Object.values(groups) as any[]) {
			if (!Array.isArray(group?.models)) continue;
			for (const model of group.models) {
				if (typeof model?.id === "string" && MODEL_NAME.test(model.id)) {
					result.add(model.id);
				}
			}
		}
	}
	return result;
}

function getModelPullAllowance(): number {
	let candidate = path.resolve(
		process.env.OLLAMA_MODELS ||
			path.join(app.getPath("home"), ".ollama", "models"),
	);
	while (!fs.existsSync(candidate) && path.dirname(candidate) !== candidate) {
		candidate = path.dirname(candidate);
	}
	const stats = fs.statfsSync(candidate);
	return (
		Number(stats.bavail) * Number(stats.bsize) - MODEL_STORAGE_RESERVE_BYTES
	);
}

export function createOllamaRouter(io: SocketIOServer) {
	const OllamaRouter = express.Router();
	OllamaRouter.use(express.json({ limit: MAX_JSON_BYTES }));

	const ollama = new Ollama({
		host: OLLAMA_URL,
	});

	OllamaRouter.get("/", (_req, res) => {
		res.json({ message: "Ollama API is working" });
	});

	OllamaRouter.get("/isinstalled", async (_req, res) => {
		logger.ai("Checking if Ollama is installed...");
		const config = readConfig();
		const binFolder = path.join(
			config?.defaultBinFolder || path.join(app.getPath("userData")),
			"bin",
		);
		const result = await checkOneDependency("ollama", binFolder);
		logger.ai(
			`Ollama is installed?: ${result.installed}, reason: ${result.reason}`,
		);
		res.json(result);
	});

	OllamaRouter.post("/install", async (_req, res) => {
		logger.ai("Installing Ollama...");
		let installed = false;
		const result = await installDependency("ollama", "ollama", io);
		if (result.success) {
			installed = true;
		}
		logger.ai(`Installation finished.`);
		res.json({ installed });
	});

	OllamaRouter.post("/start", async (_req, res) => {
		logger.ai("Starting Ollama...");
		const config = readConfig();
		const binFolder = path.join(
			config?.defaultBinFolder || path.join(app.getPath("userData")),
			"bin",
		);
		const ollamaDir = path.join(binFolder, "ollama");
		const command = "ollama serve";

		if (!fs.existsSync(ollamaDir)) {
			logger.ai("Ollama directory does not exist.");
			return res.status(400).json({ error: "Ollama directory does not exist" });
		}

		if (activeProcess) {
			logger.ai("Ollama server already running.");
			return res.status(400).json({ error: "Ollama server already running" });
		}

		try {
			const ENVIRONMENT = getAllValues();
			activeProcess = spawn(command, {
				cwd: ollamaDir,
				shell: true,
				env: ENVIRONMENT,
			});

			if (!activeProcess) {
				res.status(500).json({ error: "Failed to start Ollama server" });
				return;
			}

			// Ollama output can contain request content; never persist raw stdout/stderr.
			activeProcess?.stdout?.resume();
			activeProcess?.stderr?.resume();

			activeProcess.on("exit", (code) => {
				logger.ai(`Ollama server exited with code ${code}`);
				activeProcess = null;
			});

			logger.ai(`Ollama server started with PID ${activeProcess.pid}`);

			res.json({ message: "Ollama server started", pid: activeProcess.pid });
		} catch (error) {
			logger.error(
				`Ollama start failed metadata=${JSON.stringify(safeError(error))}`,
			);
			res.status(500).json({ error: "Failed to start Ollama server" });
		}
	});

	OllamaRouter.post("/stop", async (_req, res) => {
		if (!activeProcess || !activeProcess.pid) {
			logger.ai("No Ollama server running.");
			return res.status(400).json({ error: "No Ollama server running" });
		}

		await stopActiveProcess(io, "ollama", activeProcess.pid);
		activeProcess = null;

		res.json({ message: "Ollama server stopped" });
	});

	// ollama routes

	OllamaRouter.get("/models", async (_req, res) => {
		try {
			// wait until ollama server is ready
			await new Promise((resolve) => setTimeout(resolve, 500));
			const response = await ollama.list();
			logger.ai(`Ollama models listed count=${response.models.length}`);
			res.json(response);
		} catch (error) {
			logger.error(
				`Ollama model list failed metadata=${JSON.stringify(safeError(error))}`,
			);
			res.status(500).json({ error: "Failed to fetch downloaded models" });
		}
	});

	OllamaRouter.get("/available-models", async (_req, res) => {
		try {
			const response = await fetch(
				"https://api-getdione-app.deeivihh.workers.dev/v1/ai/models",
				{
					method: "GET",
					headers: {
						...(process.env.DIONE_API_KEY
							? { Authorization: `Bearer ${process.env.DIONE_API_KEY}` }
							: {}),
					},
				},
			);

			if (!response.ok) {
				await response.body?.cancel();
				logger.error(`Failed to fetch models status=${response.status}`);
				return res.status(response.status).json({
					error: "Failed to fetch models",
				});
			}

			const data = await response.json();
			supportedModels = extractSupportedModels(data);
			logger.ai(`Available models fetched count=${supportedModels.size}`);
			res.json(data);
		} catch (error) {
			logger.error(
				`Supported model fetch failed metadata=${JSON.stringify(safeError(error))}`,
			);
			res.status(500).json({ error: "Failed to fetch models" });
		}
	});

	OllamaRouter.post("/download-model", async (req, res) => {
		const requestId = randomUUID();
		const startedAt = Date.now();
		if (activePulls >= MAX_PULL_CONCURRENCY) {
			return res.status(429).json({ error: "Model download capacity reached" });
		}
		activePulls++;
		const operation = new AbortController();
		const requestOllama = new Ollama({
			host: OLLAMA_URL,
			fetch: (input: RequestInfo | URL, init?: RequestInit) =>
				fetch(input, { ...init, signal: operation.signal }),
		});
		const abortRequest = () => {
			operation.abort();
			requestOllama.abort();
		};
		const onResponseClose = () => {
			if (!res.writableEnded) abortRequest();
		};
		const timeout = setTimeout(abortRequest, PULL_TIMEOUT_MS);
		req.once("aborted", abortRequest);
		res.once("close", onResponseClose);
		try {
			const { model } = req.query;
			if (
				typeof model !== "string" ||
				!MODEL_NAME.test(model) ||
				!supportedModels.has(model)
			) {
				return res.status(400).json({ error: "Unsupported model" });
			}
			recentPulls = recentPulls.filter(
				(time) => Date.now() - time < 60 * 60_000,
			);
			if (recentPulls.length >= MAX_PULLS_PER_HOUR) {
				return res
					.status(429)
					.json({ error: "Model download rate limit reached" });
			}
			const pullAllowance = getModelPullAllowance();
			if (pullAllowance <= 0) {
				return res
					.status(507)
					.json({ error: "Insufficient model storage space" });
			}
			recentPulls.push(Date.now());

			const stream = await requestOllama.pull({ model, stream: true });
			const layerSizes = new Map<string, number>();

			for await (const part of stream) {
				let percent = 0;

				if (part.digest) {
					if (
						typeof part.completed === "number" &&
						typeof part.total === "number"
					) {
						layerSizes.set(part.digest, part.total);
						const expectedBytes = [...layerSizes.values()].reduce(
							(total, size) => total + size,
							0,
						);
						if (expectedBytes > pullAllowance) {
							abortRequest();
							throw new Error("Model exceeds the available storage budget");
						}
						percent = Math.round((part.completed / part.total) * 100);
					}
				}

				io.emit("ollama:download-progress", {
					model,
					percentage: percent,
					status: part.status,
				});
			}

			io.emit("ollama:download-progress", {
				model,
				percentage: 100,
				status: "completed",
			});

			res.json({ success: true });
		} catch (err) {
			logger.error(
				`Ollama pull id=${requestId} outcome=error metadata=${JSON.stringify(safeError(err))} durationMs=${Date.now() - startedAt}`,
			);
			io.emit("ollama:download-progress", {
				model: req.query.model,
				percentage: 0,
				status: "error",
			});
			if (!res.headersSent)
				res.status(500).json({ error: "Failed to download model" });
		} finally {
			clearTimeout(timeout);
			req.off("aborted", abortRequest);
			res.off("close", onResponseClose);
			activePulls--;
		}
	});

	OllamaRouter.post("/chat", async (req, res) => {
		const requestId = randomUUID();
		const startedAt = Date.now();
		if (activeChats >= MAX_CHAT_CONCURRENCY) {
			return res.status(429).json({ error: "Chat capacity reached" });
		}
		activeChats++;
		const operation = new AbortController();
		const requestOllama = new Ollama({
			host: OLLAMA_URL,
			fetch: (input: RequestInfo | URL, init?: RequestInit) =>
				fetch(input, { ...init, signal: operation.signal }),
		});
		const abortRequest = () => {
			operation.abort();
			requestOllama.abort();
		};
		const onResponseClose = () => {
			if (!res.writableEnded) abortRequest();
		};
		const timeout = setTimeout(abortRequest, CHAT_TIMEOUT_MS);
		req.once("aborted", abortRequest);
		res.once("close", onResponseClose);
		try {
			const {
				model,
				support = [],
				quickAI = false,
				messages: history = [],
				code,
			} = req.body;
			if (
				typeof model !== "string" ||
				!MODEL_NAME.test(model) ||
				!supportedModels.has(model) ||
				!Array.isArray(support) ||
				support.length > 32 ||
				byteLength(support) > MAX_PROMPT_BYTES ||
				support.some(
					(item) => typeof item !== "string" || byteLength(item) > 1024,
				) ||
				typeof quickAI !== "boolean" ||
				!Array.isArray(history) ||
				history.length > MAX_HISTORY_MESSAGES
			) {
				return res.status(400).json({ error: "Invalid chat request" });
			}
			let historyBytes = 0;
			for (const message of history) {
				if (
					!message ||
					(message.role !== "user" && message.role !== "assistant") ||
					typeof message.content !== "string" ||
					byteLength(message.content) > MAX_MESSAGE_BYTES
				)
					return res.status(400).json({ error: "Invalid chat history" });
				historyBytes += byteLength(message.content);
			}
			if (
				historyBytes > MAX_HISTORY_BYTES ||
				history.length === 0 ||
				(code !== undefined && (!code || typeof code !== "object"))
			) {
				return res.status(400).json({ error: "Chat context exceeds limits" });
			}
			const { context, name, path, workspaceFiles, workspaceName } = code || {};
			if (
				(context !== undefined && typeof context !== "string") ||
				byteLength(context ?? "") > MAX_CONTEXT_BYTES ||
				byteLength(workspaceFiles ?? null) > MAX_WORKSPACE_BYTES ||
				[name, path, workspaceName].some(
					(value) =>
						value !== undefined &&
						(typeof value !== "string" || byteLength(value) > 1024),
				)
			)
				return res.status(400).json({ error: "Invalid chat context" });
			const installed = await requestOllama.list();
			if (
				!installed.models.some((item: { name: string }) => item.name === model)
			) {
				return res.status(400).json({ error: "Model is not installed" });
			}

			const tools = await getTools(io, operation.signal);
			const systemprompt = getSysPrompt(
				context,
				name,
				path,
				workspaceFiles,
				workspaceName,
				quickAI,
			);

			const messages = [{ role: "system", content: systemprompt }, ...history];
			logger.ai(
				`Ollama chat id=${requestId} model=${model} messages=${messages.length} historyBytes=${historyBytes} supportBytes=${byteLength(support)} contextBytes=${byteLength(context ?? "")} workspaceBytes=${byteLength(workspaceFiles ?? null)} outcome=started`,
			);
			const finalResponse = await handleOllamaChat({
				model,
				messages,
				tools,
				client: requestOllama,
				signal: operation.signal,
			});
			logger.ai(
				`Ollama chat id=${requestId} model=${model} outputBytes=${byteLength(finalResponse?.message?.content ?? "")} durationMs=${Date.now() - startedAt} outcome=success`,
			);
			res.json(finalResponse);
		} catch (error: any) {
			logger.error(
				`Ollama chat id=${requestId} outcome=error metadata=${JSON.stringify(safeError(error))} durationMs=${Date.now() - startedAt}`,
			);

			if (error instanceof Error && error.message.includes("not found")) {
				res.status(500).json({
					error: "Model Not Found",
					message: "Model Not Found, please select a valid model.",
				});
				return;
			}

			if (!res.headersSent)
				res.status(500).json({
					error: `Unexpected error`,
					message: "Unexpected error processing chat request.",
				});
		} finally {
			clearTimeout(timeout);
			req.off("aborted", abortRequest);
			res.off("close", onResponseClose);
			activeChats--;
		}
	});

	async function handleOllamaChat({ model, messages, tools, client, signal }) {
		const executeTool = async (toolFn: (args: any) => unknown, args: any) => {
			if (signal.aborted) throw new Error("Chat request aborted");
			let rejectAbort: (reason: Error) => void = () => {};
			const aborted = new Promise<never>((_resolve, reject) => {
				rejectAbort = reject;
			});
			const onAbort = () => rejectAbort(new Error("Chat request aborted"));
			signal.addEventListener("abort", onAbort, { once: true });
			try {
				return await Promise.race([toolFn(args), aborted]);
			} finally {
				signal.removeEventListener("abort", onAbort);
			}
		};
		const serializeToolResult = (value: unknown) => {
			const serialized = JSON.stringify(value);
			if (byteLength(serialized) > MAX_TOOL_OUTPUT_BYTES) {
				return JSON.stringify({ error: "Tool output exceeded size limit" });
			}
			return serialized;
		};
		for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
			if (signal.aborted) throw new Error("Chat request aborted");
			// 1. call model
			const response = await client.chat({
				model,
				messages,
				options: { num_predict: MAX_OUTPUT_TOKENS },
			});

			const content = response.message?.content || "";

			// 2. detect tool call with <tools> tags
			const toolRegex = /<tools>([\s\S]*?)<\/tools>/;
			const answerRegex = /<answer>([\s\S]*?)<\/answer>/;
			const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/;

			const toolMatch = content.match(toolRegex);
			const answerMatch = content.match(answerRegex);
			const thoughtMatch = content.match(thoughtRegex);

			if (toolMatch) {
				let parsed: any;
				try {
					parsed = JSON.parse(toolMatch[1]);
				} catch {
					// if !json, return normal answer
					if (answerMatch) {
						response.message.content = answerMatch[1].trim();
						return response;
					}
				}

				if (parsed && parsed.tool) {
					const toolName = parsed.tool;
					const args = parsed.arguments || {};

					// map legacy tools
					const actualToolName = toolName;
					const toolFn = tools[actualToolName];

					if (!toolFn) {
						return {
							...response,
							error: `Unknown tool: ${toolName}`,
						};
					}

					// execute tool
					let toolResult: any;
					try {
						toolResult = await executeTool(toolFn, args);
					} catch (err: any) {
						toolResult = { error: err.message || "Tool execution failed" };
					}

					// result to messages
					messages.push({
						role: "assistant",
						content: content,
					});

					messages.push({
						role: "user",
						content: `Tool Output: ${serializeToolResult(toolResult)}`,
					});

					continue;
				}
			}

			// 3. if no tool, check for answer
			if (answerMatch) {
				response.message.content = answerMatch[1].trim();
				return response;
			}

			// 4. fallback: check for a raw JSON
			try {
				const parsed = JSON.parse(content);
				if (parsed.tool) {
					const toolName = parsed.tool;
					const args = parsed.arguments || {};

					// map legacy tools
					const actualToolName = toolName;
					const toolFn = tools[actualToolName];

					if (toolFn) {
						let toolResult: any;
						try {
							toolResult = await executeTool(toolFn, args);
						} catch (err: any) {
							toolResult = { error: err.message || "Tool execution failed" };
						}
						messages.push({ role: "assistant", content: content });
						messages.push({
							role: "user",
							content: `Tool Output: ${serializeToolResult(toolResult)}`,
						});
						continue;
					}
				}
			} catch {}

			// 5. if nothing matched, return normal content
			if (thoughtMatch) {
				response.message.content = content.replace(thoughtRegex, "").trim();
			}
			return response;
		}
		throw new Error("Tool iteration limit reached");
	}

	return OllamaRouter;
}
