import assert from "node:assert/strict";
import {
	createHash,
	createPublicKey,
	generateKeyPairSync,
	sign,
	verify,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ATTESTATION_VERSION = 1;
const BUILD_CONFIG_KEYS = [
	"VITE_PUBLIC_REMOTE_INSTALLS_ENABLED",
	"VITE_PUBLIC_DIONE_CATALOG_URL",
	"DIONE_PUBLISHER_TRUST_STORE",
	"VITE_PUBLIC_SUPABASE_URL",
	"VITE_PUBLIC_SUPABASE_ANON_KEY",
] as const;
const projectRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

interface CatalogRecord {
	id?: unknown;
	name?: unknown;
	version?: unknown;
	script_url?: unknown;
	commit_hash?: unknown;
	manifest_sha256?: unknown;
	publisher_key_id?: unknown;
	publisher_signature?: unknown;
}

function required(value: string | undefined, name: string): string {
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function configDigest(): string {
	const values = BUILD_CONFIG_KEYS.map((key) => [key, process.env[key] ?? ""]);
	return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export function parseTrustStore(raw: string): Record<string, string> {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new Error("Publisher trust store is not valid JSON");
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Publisher trust store must be an object");
	}
	const entries = Object.entries(value);
	if (entries.length === 0) throw new Error("Publisher trust store is empty");
	for (const [keyId, pem] of entries) {
		if (!/^[A-Za-z0-9._-]{1,128}$/.test(keyId) || typeof pem !== "string") {
			throw new Error("Publisher trust store contains an invalid entry");
		}
		try {
			const key = createPublicKey(pem);
			if (key.asymmetricKeyType !== "ed25519") throw new Error();
		} catch {
			throw new Error(`Publisher key '${keyId}' is not an Ed25519 public key`);
		}
	}
	return value as Record<string, string>;
}

export function assertAnonymousSupabaseKey(key: string): void {
	if (key.startsWith("sb_secret_")) {
		throw new Error("Supabase secret keys must never be bundled");
	}
	if (key.startsWith("sb_publishable_")) return;
	const parts = key.split(".");
	if (parts.length !== 3) {
		throw new Error("Supabase key is neither publishable nor an anonymous JWT");
	}
	try {
		const payload = JSON.parse(
			Buffer.from(parts[1], "base64url").toString("utf8"),
		);
		if (payload.role !== "anon") {
			throw new Error("Supabase JWT role is not anon");
		}
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "Supabase JWT role is not anon"
		) {
			throw error;
		}
		throw new Error("Supabase anonymous JWT payload is invalid");
	}
}

function httpsUrl(raw: string, name: string): URL {
	const url = new URL(raw);
	if (url.protocol !== "https:" || url.username || url.password) {
		throw new Error(
			`${name} must be an HTTPS URL without embedded credentials`,
		);
	}
	return url;
}

export function verifyCatalogRecord(
	record: CatalogRecord,
	trustStore: Record<string, string>,
): void {
	if (typeof record.name !== "string" || typeof record.version !== "string") {
		throw new Error("Catalog record is missing name or version");
	}
	if (typeof record.script_url !== "string") {
		throw new Error(`Catalog record '${record.name}' is missing script_url`);
	}
	httpsUrl(record.script_url, "Catalog script URL");
	const commits = record.commit_hash;
	if (!commits || typeof commits !== "object" || Array.isArray(commits)) {
		throw new Error(`Catalog record '${record.name}' has no commit map`);
	}
	const commit = (commits as Record<string, unknown>)[record.version];
	if (typeof commit !== "string" || !/^[a-f0-9]{40}$/i.test(commit)) {
		throw new Error(
			`Catalog record '${record.name}' is not pinned to a commit`,
		);
	}
	if (
		typeof record.manifest_sha256 !== "string" ||
		!/^[a-f0-9]{64}$/i.test(record.manifest_sha256)
	) {
		throw new Error(`Catalog record '${record.name}' has no manifest SHA-256`);
	}
	if (typeof record.publisher_key_id !== "string") {
		throw new Error(`Catalog record '${record.name}' has no publisher key ID`);
	}
	const publicKey = trustStore[record.publisher_key_id];
	if (!publicKey) {
		throw new Error(
			`Catalog record '${record.name}' uses an untrusted publisher`,
		);
	}
	if (typeof record.publisher_signature !== "string") {
		throw new Error(
			`Catalog record '${record.name}' has no publisher signature`,
		);
	}
	const signed = `dione-manifest-v1\nsha256:${record.manifest_sha256.toLowerCase()}\nsource:${record.script_url}\ncommit:${commit.toLowerCase()}\n`;
	let signature: Buffer;
	try {
		signature = Buffer.from(record.publisher_signature, "base64");
		if (signature.toString("base64") !== record.publisher_signature)
			throw new Error();
	} catch {
		throw new Error(
			`Catalog record '${record.name}' has an invalid signature encoding`,
		);
	}
	if (
		!verify(null, Buffer.from(signed), createPublicKey(publicKey), signature)
	) {
		throw new Error(
			`Catalog record '${record.name}' has an invalid publisher signature`,
		);
	}
}

async function checkRepositoryControls(): Promise<void> {
	const requiredContent = [
		[
			"src/main/server/scripts/download.ts",
			"VITE_PUBLIC_REMOTE_INSTALLS_ENABLED",
		],
		["src/main/server/scripts/trust.ts", "DIONE_PUBLISHER_TRUST_STORE"],
		[".github/workflows/build.yml", "npm run attest-deployment"],
		[
			"supabase/migrations/20260728000000_dione_least_privilege.sql",
			"dione_deployment_attestation",
		],
		["docs/deployment-readiness.md", "Live production attestation"],
	] as const;
	for (const [relativePath, marker] of requiredContent) {
		const content = await fs.readFile(
			path.join(projectRoot, relativePath),
			"utf8",
		);
		if (!content.includes(marker)) {
			throw new Error(
				`${relativePath} is missing deployment control '${marker}'`,
			);
		}
	}
}

async function fetchJson(url: URL, init?: RequestInit): Promise<unknown> {
	const response = await fetch(url, {
		...init,
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok)
		throw new Error(`Live attestation request failed (${response.status})`);
	return response.json();
}

async function attestCatalog(
	url: URL,
	trustStore: Record<string, string>,
	readJson: (url: URL) => Promise<unknown> = fetchJson,
): Promise<void> {
	let checked = 0;
	let cursor: string | null = null;
	let snapshotId: string | undefined;
	let total: number | undefined;
	const recordIds = new Set<string>();
	const cursors = new Set<string>();
	for (;;) {
		const pageUrl = new URL(url);
		pageUrl.searchParams.set("attestation", "1");
		if (cursor) pageUrl.searchParams.set("cursor", cursor);
		const data = await readJson(pageUrl);
		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw new Error(
				"Catalog does not implement the attestation page contract",
			);
		}
		const page = data as Record<string, unknown>;
		if (
			typeof page.snapshot_id !== "string" ||
			page.snapshot_id.length === 0 ||
			!Number.isSafeInteger(page.total) ||
			(page.total as number) < 1 ||
			!Array.isArray(page.records) ||
			!(page.next_cursor === null || typeof page.next_cursor === "string")
		) {
			throw new Error("Catalog returned an invalid attestation page");
		}
		snapshotId ??= page.snapshot_id;
		total ??= page.total as number;
		if (page.snapshot_id !== snapshotId || page.total !== total) {
			throw new Error("Catalog changed during attestation");
		}
		if (page.records.length === 0 && page.next_cursor !== null) {
			throw new Error("Catalog attestation cursor made no progress");
		}
		for (const record of page.records) {
			if (!record || typeof record !== "object") {
				throw new Error("Catalog attestation record is invalid");
			}
			const id = (record as CatalogRecord).id;
			if (!(typeof id === "string" || typeof id === "number")) {
				throw new Error("Catalog attestation record has no stable ID");
			}
			const stableId = `${typeof id}:${id}`;
			if (recordIds.has(stableId)) {
				throw new Error("Catalog attestation returned a duplicate record");
			}
			recordIds.add(stableId);
			verifyCatalogRecord(record as CatalogRecord, trustStore);
		}
		checked += page.records.length;
		if (checked > total)
			throw new Error("Catalog attestation exceeds declared total");
		if (page.next_cursor === null) break;
		cursor = page.next_cursor as string;
		if (!cursor || cursors.has(cursor)) {
			throw new Error("Catalog attestation returned a repeated cursor");
		}
		cursors.add(cursor);
	}
	if (checked !== total)
		throw new Error("Catalog attestation did not enumerate every record");
	console.log(`Live catalog attestation passed (${checked} signed records).`);
}

async function attestSupabase(url: URL, key: string): Promise<void> {
	const rpcUrl = new URL("/rest/v1/rpc/dione_deployment_attestation", url);
	const data = await fetchJson(rpcUrl, {
		method: "POST",
		headers: {
			apikey: key,
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: "{}",
	});
	if (
		!data ||
		typeof data !== "object" ||
		(data as Record<string, unknown>).contract_version !==
			ATTESTATION_VERSION ||
		(data as Record<string, unknown>).ok !== true ||
		!Array.isArray((data as Record<string, unknown>).violations) ||
		((data as Record<string, unknown>).violations as unknown[]).length !== 0
	) {
		throw new Error(
			"Supabase RLS/grant attestation did not return a clean v1 result",
		);
	}
	console.log("Live Supabase anonymous RLS/grant attestation passed.");
}

async function selfTest(): Promise<void> {
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
	const store = parseTrustStore(JSON.stringify({ fixture: pem }));
	assertAnonymousSupabaseKey("sb_publishable_fixture");
	const anonPayload = Buffer.from(JSON.stringify({ role: "anon" })).toString(
		"base64url",
	);
	assertAnonymousSupabaseKey(`x.${anonPayload}.x`);
	assert.throws(
		() => assertAnonymousSupabaseKey("sb_secret_fixture"),
		/never be bundled/,
	);
	const record: CatalogRecord = {
		id: 1,
		name: "fixture",
		version: "1.0.0",
		script_url: "https://github.com/example/fixture/blob/main/dione.json",
		commit_hash: { "1.0.0": "a".repeat(40) },
		manifest_sha256: "b".repeat(64),
		publisher_key_id: "fixture",
	};
	const payload = `dione-manifest-v1\nsha256:${record.manifest_sha256}\nsource:${record.script_url}\ncommit:${"a".repeat(40)}\n`;
	record.publisher_signature = sign(
		null,
		Buffer.from(payload),
		privateKey,
	).toString("base64");
	verifyCatalogRecord(record, store);
	await attestCatalog(
		new URL("https://catalog.example.test/v1/scripts"),
		store,
		async () => ({
			snapshot_id: "fixture-snapshot",
			total: 1,
			records: [record],
			next_cursor: null,
		}),
	);
	await assert.rejects(
		attestCatalog(
			new URL("https://catalog.example.test/v1/scripts"),
			store,
			async () => ({
				snapshot_id: "fixture-snapshot",
				total: 2,
				records: [record],
				next_cursor: null,
			}),
		),
		/did not enumerate every record/,
	);
	record.manifest_sha256 = "c".repeat(64);
	assert.throws(
		() => verifyCatalogRecord(record, store),
		/invalid publisher signature/,
	);
	console.log("Deterministic deployment-readiness fixtures passed.");
}

async function main(): Promise<void> {
	const args = new Set(process.argv.slice(2));
	if (args.has("--config-digest")) {
		console.log(configDigest());
		return;
	}
	if (args.has("--verify-config-digest")) {
		if (configDigest() !== process.env.DIONE_EXPECTED_CONFIG_DIGEST) {
			throw new Error(
				"Packaged public configuration differs from live attestation",
			);
		}
		console.log("Packaged public configuration matches live attestation.");
		return;
	}
	if (args.has("--self-test")) return selfTest();
	await checkRepositoryControls();
	console.log("Offline repository deployment controls passed.");

	const release = args.has("--release");
	const live = args.has("--live");
	const enabled = process.env.VITE_PUBLIC_REMOTE_INSTALLS_ENABLED;
	if (release && enabled !== "true" && enabled !== "false") {
		throw new Error(
			"Production release must explicitly enable or disable remote installs",
		);
	}

	let trustStore: Record<string, string> | undefined;
	let catalogUrl: URL | undefined;
	if (enabled === "true") {
		trustStore = parseTrustStore(
			required(
				process.env.DIONE_PUBLISHER_TRUST_STORE,
				"DIONE_PUBLISHER_TRUST_STORE",
			),
		);
		catalogUrl = httpsUrl(
			required(
				process.env.VITE_PUBLIC_DIONE_CATALOG_URL,
				"VITE_PUBLIC_DIONE_CATALOG_URL",
			),
			"Catalog URL",
		);
	}

	const supabaseUrlRaw = process.env.VITE_PUBLIC_SUPABASE_URL;
	const supabaseKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
	if (release && (!supabaseUrlRaw || !supabaseKey)) {
		throw new Error(
			"Production release requires Supabase URL and anonymous key attestation",
		);
	}
	let supabaseUrl: URL | undefined;
	if (supabaseUrlRaw && supabaseKey) {
		supabaseUrl = httpsUrl(supabaseUrlRaw, "Supabase URL");
		assertAnonymousSupabaseKey(supabaseKey);
	}

	if (release && !live)
		throw new Error("Production release requires --live attestation");
	if (live) {
		if (!supabaseUrl || !supabaseKey)
			throw new Error("Live Supabase attestation is not configured");
		await attestSupabase(supabaseUrl, supabaseKey);
		if (enabled === "true") {
			await attestCatalog(
				catalogUrl as URL,
				trustStore as Record<string, string>,
			);
		}
	}
}

main().catch((error) => {
	console.error(
		error instanceof Error
			? `Deployment readiness failed: ${error.message}`
			: error,
	);
	process.exitCode = 1;
});
