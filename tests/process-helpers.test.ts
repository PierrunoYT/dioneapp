import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
	appendBoundedOutput,
	createCommandDeadline,
	resolveContainedWorkingDirectory,
} from "../src/main/server/scripts/process-helpers";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string) {
	const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) =>
				fs.promises.rm(directory, { recursive: true, force: true }),
			),
	);
});

test("bounded process output retains the newest complete UTF-8 characters", () => {
	assert.equal(appendBoundedOutput("old", "-new", 4), "-new");
	assert.equal(appendBoundedOutput("start", "🙂end", 7), "🙂end");
});

test("bounded process output rejects invalid byte limits", () => {
	for (const limit of [0, -1, 1.5, Number.NaN]) {
		assert.throws(
			() => appendBoundedOutput("", "output", limit),
			/positive integer/,
		);
	}
});

test("working-directory resolution returns canonical contained directories", async () => {
	const root = await temporaryDirectory("dione-process-root-");
	const nested = path.join(root, "nested");
	await fs.promises.mkdir(nested);
	assert.equal(
		await resolveContainedWorkingDirectory(root, "nested"),
		await fs.promises.realpath(nested),
	);
});

test("working-directory resolution rejects traversal and symlink escapes", async () => {
	const parent = await temporaryDirectory("dione-process-parent-");
	const root = path.join(parent, "root");
	const outside = path.join(parent, "outside");
	await Promise.all([fs.promises.mkdir(root), fs.promises.mkdir(outside)]);
	await assert.rejects(
		() => resolveContainedWorkingDirectory(root, "../outside"),
		/escapes/,
	);
	const link = path.join(root, "link");
	await fs.promises.symlink(outside, link, "dir");
	await assert.rejects(
		() => resolveContainedWorkingDirectory(root, "link"),
		/escapes/,
	);
});

test("working-directory resolution rejects regular files", async () => {
	const root = await temporaryDirectory("dione-process-file-");
	await fs.promises.writeFile(path.join(root, "file.txt"), "data");
	await assert.rejects(
		() => resolveContainedWorkingDirectory(root, "file.txt"),
		/not a directory/,
	);
});

test("command deadlines propagate parent cancellation without reporting timeout", async () => {
	const parent = new AbortController();
	const reason = new Error("cancelled");
	const deadline = createCommandDeadline(parent.signal, 5);
	parent.abort(reason);
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(deadline.signal.aborted, true);
	assert.equal(deadline.signal.reason, reason);
	assert.equal(deadline.timedOut, false);
	deadline.dispose();
});

test(
	"command deadlines abort and report expiration",
	{ timeout: 1_000 },
	async () => {
		const deadline = createCommandDeadline(undefined, 5);
		await new Promise<void>((resolve) =>
			deadline.signal.addEventListener("abort", () => resolve(), {
				once: true,
			}),
		);
		assert.equal(deadline.signal.aborted, true);
		assert.equal(deadline.timedOut, true);
		assert.match(String(deadline.signal.reason), /timed out/);
		deadline.dispose();
	},
);
