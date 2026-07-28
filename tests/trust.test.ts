import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
	consumeLocalApproval,
	createLocalApproval,
	loadTrustedManifest,
	validateManifestBytes,
} from "../src/main/server/scripts/trust";

const temporaryDirectories: string[] = [];

const validManifest = () => ({
	manifestVersion: 1,
	capabilities: ["native_commands"],
	name: "Example",
	installation: [{ name: "Install", commands: ["echo install"] }],
	start: [],
});

const bytes = (manifest: unknown) => Buffer.from(JSON.stringify(manifest));

async function writeManifest(manifest: unknown = validManifest()) {
	const directory = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), "dione-trust-test-"),
	);
	temporaryDirectories.push(directory);
	const manifestPath = path.join(directory, "dione.json");
	await fs.promises.writeFile(manifestPath, bytes(manifest));
	return manifestPath;
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

test("valid trust manifests pass strict schema validation", () => {
	assert.equal(validateManifestBytes(bytes(validManifest())).name, "Example");
});

test("trust manifests reject invalid JSON, roots, and unsupported properties", () => {
	assert.throws(() => validateManifestBytes(Buffer.from("{")), /valid JSON/);
	assert.throws(() => validateManifestBytes(Buffer.from("[]")), /root/);
	assert.throws(
		() =>
			validateManifestBytes(bytes({ ...validManifest(), unexpected: true })),
		/unsupported root properties/,
	);
});

test("trust manifests reject missing or undeclared native command capability", () => {
	assert.throws(
		() =>
			validateManifestBytes(bytes({ ...validManifest(), capabilities: [] })),
		/capabilities/,
	);
	assert.throws(
		() =>
			validateManifestBytes(
				bytes({ ...validManifest(), capabilities: ["filesystem"] }),
			),
		/native_commands/,
	);
});

test("trust manifests reject unsupported command properties", () => {
	const manifest = validManifest();
	manifest.installation[0].commands = [
		{ command: "echo unsafe", shell: true } as unknown as string,
	];
	assert.throws(
		() => validateManifestBytes(bytes(manifest)),
		/Unsupported manifest command property/,
	);
});

test("trust manifests enforce byte and command count limits", () => {
	assert.throws(
		() => validateManifestBytes(Buffer.alloc(256 * 1024 + 1, 32)),
		/size/,
	);
	const manifest = validManifest();
	manifest.installation[0].commands = Array.from(
		{ length: 257 },
		() => "echo excessive",
	);
	assert.throws(
		() => validateManifestBytes(bytes(manifest)),
		/too many commands/,
	);
});

test("unapproved local manifests cannot cross the execution trust boundary", async () => {
	const manifestPath = await writeManifest();
	await assert.rejects(
		() => loadTrustedManifest(manifestPath),
		/no verified trust receipt/,
	);
});

test("local approval is bound to exact manifest bytes", async () => {
	const manifestPath = await writeManifest();
	const nonce = await createLocalApproval(manifestPath);
	await fs.promises.writeFile(
		manifestPath,
		bytes({ ...validManifest(), name: "Changed" }),
	);
	await assert.rejects(
		() => consumeLocalApproval(manifestPath, nonce),
		/changed after approval/,
	);
});

test("local approval nonces are path-bound and single use", async () => {
	const firstPath = await writeManifest();
	const secondPath = await writeManifest();
	const nonce = await createLocalApproval(firstPath);
	await assert.rejects(
		() => consumeLocalApproval(secondPath, nonce),
		/invalid or expired/,
	);
	await assert.rejects(
		() => consumeLocalApproval(firstPath, nonce),
		/invalid or expired/,
	);
});

test("an unchanged explicitly approved local manifest becomes loadable", async () => {
	const manifestPath = await writeManifest();
	const nonce = await createLocalApproval(manifestPath);
	await consumeLocalApproval(manifestPath, nonce);
	assert.equal((await loadTrustedManifest(manifestPath)).name, "Example");
});
