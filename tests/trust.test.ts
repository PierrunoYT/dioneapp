import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
	consumeLocalApproval,
	createLocalApproval,
	createManifestTrust,
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

test("publisher signatures create receipts and manifest/receipt/key tampering is rejected", async () => {
	const manifestPath = await writeManifest();
	const manifestBytes = await fs.promises.readFile(manifestPath);
	const hash = createHash("sha256").update(manifestBytes).digest("hex");
	const sourceUrl = "https://example.invalid/publisher/repo";
	const commit = "a".repeat(40);
	const { privateKey, publicKey } = generateKeyPairSync("ed25519");
	const publicPem = publicKey
		.export({ type: "spki", format: "pem" })
		.toString();
	const publisherTrust = createManifestTrust({ publisher: publicPem });
	const canonical = `dione-manifest-v1\nsha256:${hash}\nsource:${sourceUrl}\ncommit:${commit}\n`;
	await publisherTrust.verifyAndRecordRemoteManifest(manifestPath, {
		manifestSha256: hash,
		publisherKeyId: "publisher",
		publisherSignature: sign(null, Buffer.from(canonical), privateKey).toString(
			"base64",
		),
		sourceUrl,
		commit,
	});
	assert.equal(
		(await publisherTrust.loadTrustedManifest(manifestPath)).name,
		"Example",
	);

	const receiptPath = path.join(path.dirname(manifestPath), "dione.trust.json");
	const receipt = JSON.parse(await fs.promises.readFile(receiptPath, "utf8"));
	for (const change of [
		{ sourceUrl: "https://attacker.invalid/repo" },
		{ publisherSignature: Buffer.alloc(64).toString("base64") },
		{ publisherKeyId: "other" },
	]) {
		await fs.promises.writeFile(
			receiptPath,
			JSON.stringify({ ...receipt, ...change }),
		);
		await assert.rejects(
			() => publisherTrust.loadTrustedManifest(manifestPath),
			/receipt|signature|trusted/,
		);
	}
	await fs.promises.writeFile(receiptPath, JSON.stringify(receipt));
	await fs.promises.writeFile(
		manifestPath,
		bytes({ ...validManifest(), name: "Tampered" }),
	);
	await assert.rejects(
		() => publisherTrust.loadTrustedManifest(manifestPath),
		/receipt is invalid|changed/,
	);

	await fs.promises.writeFile(manifestPath, manifestBytes);
	const other = generateKeyPairSync("ed25519")
		.publicKey.export({ type: "spki", format: "pem" })
		.toString();
	const attackerTrust = createManifestTrust({ publisher: other });
	await assert.rejects(
		() => attackerTrust.loadTrustedManifest(manifestPath),
		/signature/,
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
