import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BackendCallRegistry,
	isExactTrustedSender,
	resolveBackendRequest,
} from "../src/main/backend-ipc";
import { createBackendCaller } from "../src/preload/backend-call";

test("main accepts only the exact trusted webContents and main frame", () => {
	const sender = {};
	const frame = {};
	assert.equal(isExactTrustedSender(sender, frame, sender, frame), true);
	assert.equal(isExactTrustedSender({}, frame, sender, frame), false);
	assert.equal(isExactTrustedSender(sender, {}, sender, frame), false);
	assert.equal(isExactTrustedSender(sender, frame, undefined, frame), false);
});

test("backend operation mapping is closed and validates path input", () => {
	assert.deepEqual(resolveBackendRequest("config.get", {}), {
		method: "GET",
		path: "/config",
	});
	assert.deepEqual(
		resolveBackendRequest("scripts.start", {
			name: "a b",
			id: "x",
			start: "ui",
		}),
		{
			method: "POST",
			path: "/scripts/start/a%20b/x?start=ui",
		},
	);
	assert.throws(() => resolveBackendRequest("unknown", {}), /Unsupported/);
	assert.throws(
		() => resolveBackendRequest("local.delete", { name: "x\nheader" }),
		/Invalid/,
	);
	assert.throws(
		() => resolveBackendRequest("files.read", { action: "delete", name: "x" }),
		/Invalid file read/,
	);
});

test("request cancellation is owner-bound and late completion cannot remove a replacement", () => {
	const registry = new BackendCallRegistry<object>();
	const owner = {};
	const stranger = {};
	const first = registry.begin("id", owner);
	assert.equal(registry.cancel("id", stranger), false);
	assert.equal(first.controller.signal.aborted, false);
	assert.equal(registry.cancel("id", owner), true);
	assert.equal(first.controller.signal.aborted, true);
	registry.finish("id", first);
	const replacement = registry.begin("id", owner);
	registry.finish("id", first);
	assert.equal(registry.calls.get("id"), replacement);
	registry.abortOwner(owner);
	assert.equal(replacement.controller.signal.aborted, true);
	registry.finish("id", replacement);
	assert.equal(registry.calls.size, 0);
});

test("preload allocates per-call IDs, cancels in flight, and ignores cancellation after settle", async () => {
	const sent: unknown[][] = [];
	let resolve!: (value: unknown) => void;
	const ipc = {
		invoke: (...args: unknown[]) => {
			sent.push(args);
			return new Promise<unknown>((done) => {
				resolve = done;
			});
		},
		send: (...args: unknown[]) => sent.push(args),
	};
	const call = createBackendCaller(ipc, () => "request-one")("config.get", {});
	call.cancel();
	assert.deepEqual(sent, [
		["backend:call", "request-one", "config.get", {}, undefined],
		["backend:cancel", "request-one"],
	]);
	resolve({ status: 200 });
	await call.response;
	call.cancel();
	assert.equal(sent.length, 2);
});
