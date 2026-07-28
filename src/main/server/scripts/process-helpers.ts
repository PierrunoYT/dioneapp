import fs from "node:fs";
import path from "node:path";

const MAX_CAPTURED_OUTPUT_BYTES = 1024 * 1024;

export function appendBoundedOutput(
	current: string,
	incoming: string,
	maxBytes = MAX_CAPTURED_OUTPUT_BYTES,
): string {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
		throw new Error("Output limit must be a positive integer");
	}
	const combined = Buffer.from(current + incoming);
	if (combined.byteLength <= maxBytes) return combined.toString();
	let start = combined.byteLength - maxBytes;
	while (start < combined.byteLength && (combined[start] & 0xc0) === 0x80) {
		start++;
	}
	return combined.subarray(start).toString();
}

export async function resolveContainedWorkingDirectory(
	rootDirectory: string,
	requestedDirectory = ".",
): Promise<string> {
	const canonicalRoot = await fs.promises.realpath(rootDirectory);
	const candidate = path.resolve(canonicalRoot, requestedDirectory);
	const canonicalCandidate = await fs.promises.realpath(candidate);
	const relative = path.relative(canonicalRoot, canonicalCandidate);
	if (
		relative === ".." ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error("Command working directory escapes the application root");
	}
	const stats = await fs.promises.stat(canonicalCandidate);
	if (!stats.isDirectory())
		throw new Error("Command working directory is not a directory");
	return canonicalCandidate;
}

export function createCommandDeadline(
	parent: AbortSignal | undefined,
	timeoutMs: number,
) {
	const controller = new AbortController();
	let timedOut = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const abort = () => {
		if (timer) clearTimeout(timer);
		controller.abort(parent?.reason);
	};
	if (parent?.aborted) abort();
	else parent?.addEventListener("abort", abort, { once: true });
	if (!controller.signal.aborted) {
		timer = setTimeout(() => {
			if (controller.signal.aborted) return;
			timedOut = true;
			controller.abort(new Error("Command timed out"));
		}, timeoutMs);
	}
	return {
		signal: controller.signal,
		get timedOut() {
			return timedOut;
		},
		dispose: () => {
			if (timer) clearTimeout(timer);
			parent?.removeEventListener("abort", abort);
		},
	};
}
