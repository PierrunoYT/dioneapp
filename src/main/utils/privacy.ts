const SECRET_FIELD_PATTERN =
	/(?:api[-_ ]?key|access[-_ ]?token|auth(?:orization)?|cookie|credential|password|passwd|private[-_ ]?key|refresh[-_ ]?token|secret|session|token)/i;

const REPORT_TYPES = new Set(["script", "ai", "user", "error"]);
const MAX_SHORT_FIELD_BYTES = 256;
const MAX_REPORT_FIELD_BYTES = 5_000;
const TRUNCATION_MARKER = "\n[TRUNCATED]";

export interface SafeReport {
	type: "script" | "ai" | "user" | "error";
	appid?: string;
	details?: string;
	model?: string;
	input?: string;
	output?: string;
}

function utf8Prefix(value: string, maxBytes: number): string {
	const buffer = Buffer.from(value, "utf8");
	if (buffer.byteLength <= maxBytes) return value;
	let end = Math.max(0, maxBytes);
	while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
	return buffer.subarray(0, end).toString("utf8");
}

function truncateUtf8(value: string, maxBytes: number): string {
	if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
	const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, "utf8");
	if (maxBytes <= markerBytes) return utf8Prefix(TRUNCATION_MARKER, maxBytes);
	return `${utf8Prefix(value, maxBytes - markerBytes)}${TRUNCATION_MARKER}`;
}

export function sanitizeDiagnosticText(
	value: string,
	maxBytes: number,
): string {
	const boundedInput = Buffer.from(value, "utf8")
		.subarray(0, Math.max(maxBytes * 2, maxBytes))
		.toString("utf8");
	const redacted = boundedInput
		.replace(
			/(?<![A-Za-z0-9])(api[-_ ]?key|access[-_ ]?token|auth(?:orization)?|cookie|credential|password|passwd|private[-_ ]?key|refresh[-_ ]?token|secret|session|token)\b(\s*[=:]\s*)(?!\[REDACTED_SECRET\](?=$|[\s,;\]}]))(?:\[REDACTED_SECRET\][^\s,;\]}]*|"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\]}]+)/gi,
			"$1$2[REDACTED_SECRET]",
		)
		.replace(
			/\b(authorization|proxy-authorization|cookie)\s*[:=]\s*[^\r\n]+/gi,
			"$1: [REDACTED_SECRET]",
		)
		.replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED_SECRET]")
		.replace(
			/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
			"[REDACTED_SECRET]",
		)
		.replace(
			/\b(?:github_pat_|gh[pousr]_|sk-(?:live|test|proj)-|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/gi,
			"[REDACTED_SECRET]",
		)
		.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1[REDACTED_CREDENTIALS]@")
		.replace(/\b[A-Za-z]:\\(?:[^\\\r\n:*?"<>|]+\\?)+/g, "[REDACTED_PATH]")
		.replace(/\\\\[^\\\s]+\\[^\r\n\s"'<>]+/g, "[REDACTED_PATH]")
		.replace(/(^|[\s,"'=(:;])\/(?!\/)[^\r\n\s"',;)}\]]+/g, "$1[REDACTED_PATH]");
	return truncateUtf8(redacted, maxBytes);
}

export function redactSensitiveData(value: unknown, depth = 0): unknown {
	if (typeof value === "string") {
		return sanitizeDiagnosticText(value, MAX_REPORT_FIELD_BYTES);
	}
	if (value === null || typeof value !== "object") return value;
	if (depth >= 5) return "[REDACTED_NESTED_DATA]";
	if (Array.isArray(value)) {
		return value
			.slice(0, 32)
			.map((item) => redactSensitiveData(item, depth + 1));
	}

	const result: Record<string, unknown> = {};
	for (const [key, fieldValue] of Object.entries(value).slice(0, 64)) {
		result[key] = SECRET_FIELD_PATTERN.test(key)
			? "[REDACTED_SECRET]"
			: redactSensitiveData(fieldValue, depth + 1);
	}
	return result;
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("Report must be an object");
	}
	return value as Record<string, unknown>;
}

function requireString(
	value: unknown,
	field: string,
	maxBytes: number,
): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new TypeError(`Invalid report field: ${field}`);
	}
	return sanitizeDiagnosticText(value, maxBytes);
}

export function prepareSafeReport(value: unknown): SafeReport {
	const body = requireRecord(redactSensitiveData(value));
	if (typeof body.type !== "string" || !REPORT_TYPES.has(body.type)) {
		throw new TypeError("Invalid report type");
	}

	const type = body.type as SafeReport["type"];
	if (type === "script") {
		const script = requireRecord(body.script ?? body);
		return {
			type,
			appid: requireString(script.appid, "appid", MAX_SHORT_FIELD_BYTES),
			details: requireString(script.details, "details", MAX_REPORT_FIELD_BYTES),
		};
	}
	if (type === "ai") {
		const ai = requireRecord(body.ai ?? body);
		return {
			type,
			model: requireString(ai.model, "model", MAX_SHORT_FIELD_BYTES),
			input: requireString(ai.input, "input", MAX_REPORT_FIELD_BYTES),
			output: requireString(ai.output, "output", MAX_REPORT_FIELD_BYTES),
		};
	}
	return {
		type,
		details: requireString(body.details, "details", MAX_REPORT_FIELD_BYTES),
	};
}
