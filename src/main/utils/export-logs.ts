import fs from "node:fs";
import path from "node:path";
import logger from "@/server/utils/logger";
import { sanitizeDiagnosticText } from "@/utils/privacy";
import { app } from "electron";

const ALLOWED_LOG_FILES = ["error.log", "server.log"];
const MAX_LOG_BYTES = 128 * 1024;
const MAX_TOTAL_LOG_BYTES = 256 * 1024;
const MAX_LOG_LINE_BYTES = 4 * 1024;
const MAX_PREVIEW_BYTES = 12 * 1024;

export interface PreparedDebugExport {
	systemInfo: string;
	logs: Array<{ name: string; content: string }>;
}

function collectSystemInfo(): string {
	const safeFields = {
		generatedAt: new Date().toISOString(),
		appVersion: app.getVersion(),
		platform: process.platform,
		architecture: process.arch,
		nodeVersion: process.versions.node,
		electronVersion: process.versions.electron,
		chromiumVersion: process.versions.chrome,
	};
	return JSON.stringify(safeFields, null, 2);
}

function readLogTail(filePath: string): string {
	const size = fs.statSync(filePath).size;
	const bytesToRead = Math.min(size, MAX_LOG_BYTES * 2);
	const buffer = Buffer.alloc(bytesToRead);
	const descriptor = fs.openSync(filePath, "r");
	try {
		fs.readSync(descriptor, buffer, 0, bytesToRead, size - bytesToRead);
	} finally {
		fs.closeSync(descriptor);
	}
	return buffer.toString("utf8");
}

function sanitizeLog(content: string, maxBytes: number): string {
	const boundedLines = content
		.split(/\r?\n/)
		.map((line) => sanitizeDiagnosticText(line, MAX_LOG_LINE_BYTES))
		.join("\n");
	return sanitizeDiagnosticText(boundedLines, maxBytes);
}

export async function prepareDebugExport(): Promise<PreparedDebugExport> {
	const logsDir = app.getPath("logs");
	const logs: PreparedDebugExport["logs"] = [];
	let remainingBytes = MAX_TOTAL_LOG_BYTES;

	for (const name of ALLOWED_LOG_FILES) {
		if (remainingBytes <= 0) break;
		const filePath = path.join(logsDir, name);
		if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
		const content = sanitizeLog(
			readLogTail(filePath),
			Math.min(MAX_LOG_BYTES, remainingBytes),
		);
		remainingBytes -= Buffer.byteLength(content, "utf8");
		logs.push({ name, content });
	}

	return { systemInfo: collectSystemInfo(), logs };
}

export function formatDebugExportPreview(data: PreparedDebugExport): string {
	const logSummary = data.logs.length
		? data.logs
				.map(
					(log) =>
						`${log.name}: ${Buffer.byteLength(log.content, "utf8")} sanitized bytes`,
				)
				.join("\n")
		: "No log files found";
	const preview = `INCLUDED SYSTEM FIELDS (complete)\n${data.systemInfo}\n\nINCLUDED LOGS\n${logSummary}\n\nLOG CONTENT PREVIEW\n${data.logs
		.map((log) => `--- ${log.name} ---\n${log.content}`)
		.join(
			"\n\n",
		)}\n\nEXCLUDED\nConfiguration, database, environment variables, hostnames, network addresses, hardware details, device identifiers, and all other files.\n\nLIMITS\nEach line: 4 KiB; each log: 128 KiB; all logs: 256 KiB. Secrets, credentials, and sensitive paths are redacted before export.`;
	return sanitizeDiagnosticText(preview, MAX_PREVIEW_BYTES);
}

function serializeDebugExport(data: PreparedDebugExport): string {
	return `=== DIONE DEBUG REPORT ===\n\n=== SYSTEM INFORMATION ===\n${data.systemInfo}\n\n${data.logs
		.map((log) => `=== ${log.name} ===\n${log.content}`)
		.join("\n\n")}\n`;
}

/**
 * Exports allowlisted, redacted, and size-capped diagnostics as a text file
 * @param destinationPath - The path where the report should be saved
 * @param data - The diagnostics the user previewed and approved
 * @returns Path to the generated report
 */
export async function exportDebugLogs(
	destinationPath: string,
	data: PreparedDebugExport,
): Promise<string> {
	const content = serializeDebugExport(data);
	await fs.promises.writeFile(destinationPath, content, {
		encoding: "utf8",
		mode: 0o600,
	});
	logger.info(
		`Debug report exported successfully (${Buffer.byteLength(content, "utf8")} bytes)`,
	);
	return destinationPath;
}
