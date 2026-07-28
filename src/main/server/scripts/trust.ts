import {
	createHash,
	createPublicKey,
	randomBytes,
	randomUUID,
	verify,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const RECEIPT_FILE = "dione.trust.json";
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_STEPS = 64;
const MAX_COMMANDS = 256;
const MAX_COMMAND_LENGTH = 16 * 1024;
const ROOT_KEYS = new Set([
	"manifestVersion",
	"capabilities",
	"name",
	"version",
	"description",
	"author",
	"homepage",
	"icon",
	"license",
	"requirements",
	"dependencies",
	"installation",
	"start",
]);
const CAPABILITIES = new Set(["native_commands", "network", "filesystem"]);

export interface RemoteTrustMetadata {
	manifestSha256: string;
	publisherKeyId: string;
	publisherSignature: string;
	sourceUrl: string;
	commit: string;
}

interface TrustReceipt {
	version: 1;
	classification: "publisher-verified";
	manifestSha256: string;
	verifiedAt: string;
	publisherKeyId?: string;
	publisherSignature?: string;
	sourceUrl?: string;
	commit?: string;
}

const approvedLocalManifestHashes = new Set<string>();
const localApprovalNonces = new Map<
	string,
	{ manifestPath: string; manifestSha256: string; expiresAt: number }
>();

function sha256(data: Buffer): string {
	return createHash("sha256").update(data).digest("hex");
}

function assertString(value: unknown, label: string, max = 1024): void {
	if (typeof value !== "string" || value.length === 0 || value.length > max) {
		throw new Error(`Invalid manifest ${label}`);
	}
}

function validateCommands(commands: unknown, label: string): number {
	if (!Array.isArray(commands) || commands.length === 0) {
		throw new Error(`Manifest ${label} must contain commands`);
	}
	if (commands.length > MAX_COMMANDS)
		throw new Error("Manifest has too many commands");
	for (const command of commands) {
		if (typeof command === "string") {
			assertString(command, `${label} command`, MAX_COMMAND_LENGTH);
			continue;
		}
		if (!command || typeof command !== "object" || Array.isArray(command)) {
			throw new Error(`Invalid manifest ${label} command`);
		}
		const item = command as Record<string, unknown>;
		if (
			Object.keys(item).some(
				(key) =>
					!["command", "platform", "gpus", "customizable", "cwd"].includes(key),
			)
		) {
			throw new Error(`Unsupported manifest command property in ${label}`);
		}
		assertString(item.command, `${label} command`, MAX_COMMAND_LENGTH);
		if (
			item.platform !== undefined &&
			(typeof item.platform !== "string" ||
				!["windows", "mac", "linux"].includes(item.platform))
		) {
			throw new Error(`Invalid manifest platform in ${label}`);
		}
		if (item.gpus !== undefined) {
			const gpus = Array.isArray(item.gpus) ? item.gpus : [item.gpus];
			if (
				gpus.length === 0 ||
				gpus.length > 8 ||
				gpus.some((gpu) => typeof gpu !== "string" || gpu.length > 32)
			) {
				throw new Error(`Invalid manifest GPUs in ${label}`);
			}
		}
		if (
			item.customizable !== undefined &&
			typeof item.customizable !== "boolean"
		) {
			throw new Error(`Invalid customizable flag in ${label}`);
		}
		if (item.cwd !== undefined) {
			assertString(item.cwd, `${label} working directory`, 512);
		}
	}
	return commands.length;
}

function validateStep(value: unknown, label: string): number {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(`Invalid ${label}`);
	const step = value as Record<string, unknown>;
	if (
		Object.keys(step).some(
			(key) =>
				![
					"name",
					"commands",
					"variables",
					"env",
					"parallel",
					"catch",
					"steps",
				].includes(key),
		)
	) {
		throw new Error(`Unsupported property in ${label}`);
	}
	assertString(step.name, `${label} name`, 256);
	if (step.catch !== undefined) {
		const port =
			typeof step.catch === "string" && /^\d{1,5}$/.test(step.catch)
				? Number(step.catch)
				: step.catch;
		if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535)
			throw new Error(`Invalid port capability in ${label}`);
	}
	if (
		step.variables !== undefined &&
		(!Array.isArray(step.variables) || step.variables.length > 128)
	) {
		throw new Error(`Invalid variables in ${label}`);
	}
	if (Array.isArray(step.variables)) {
		for (const variable of step.variables) {
			if (!variable || typeof variable !== "object" || Array.isArray(variable))
				throw new Error(`Invalid variable in ${label}`);
			const item = variable as Record<string, unknown>;
			if (Object.keys(item).some((key) => !["key", "value"].includes(key)))
				throw new Error(`Unsupported variable property in ${label}`);
			assertString(item.key, `${label} variable key`, 128);
			if (typeof item.value !== "string" || item.value.length > 4096)
				throw new Error(`Invalid variable value in ${label}`);
		}
	}
	if (step.parallel !== undefined && typeof step.parallel !== "boolean")
		throw new Error(`Invalid parallel flag in ${label}`);
	if (step.env !== undefined) {
		if (typeof step.env === "string")
			assertString(step.env, `${label} env`, 128);
		else {
			if (!step.env || typeof step.env !== "object" || Array.isArray(step.env))
				throw new Error(`Invalid environment in ${label}`);
			const env = step.env as Record<string, unknown>;
			if (
				Object.keys(env).some(
					(key) => !["name", "type", "version"].includes(key),
				)
			)
				throw new Error(`Unsupported environment property in ${label}`);
			assertString(env.name, `${label} environment name`, 128);
			if (env.type !== undefined)
				assertString(env.type, `${label} environment type`, 32);
			if (env.version !== undefined)
				assertString(env.version, `${label} environment version`, 32);
		}
	}
	if (Array.isArray(step.steps))
		return validateSteps(step.steps, `${label} steps`);
	return validateCommands(step.commands, label);
}

function validateSteps(value: unknown, label: string): number {
	if (!Array.isArray(value) || value.length > MAX_STEPS)
		throw new Error(`Invalid manifest ${label}`);
	return value.reduce(
		(count, step, index) => count + validateStep(step, `${label}[${index}]`),
		0,
	);
}

export function validateManifestBytes(bytes: Buffer): Record<string, unknown> {
	if (bytes.length === 0 || bytes.length > MAX_MANIFEST_BYTES)
		throw new Error("Manifest size is outside allowed bounds");
	let manifest: unknown;
	try {
		manifest = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new Error("Manifest is not valid JSON");
	}
	if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
		throw new Error("Manifest root must be an object");
	const root = manifest as Record<string, unknown>;
	if (Object.keys(root).some((key) => !ROOT_KEYS.has(key)))
		throw new Error("Manifest contains unsupported root properties");
	if (root.manifestVersion !== 1)
		throw new Error("Manifest manifestVersion must be 1");
	if (
		!Array.isArray(root.capabilities) ||
		root.capabilities.length === 0 ||
		root.capabilities.some(
			(item) => typeof item !== "string" || !CAPABILITIES.has(item),
		)
	) {
		throw new Error("Manifest capabilities are missing or unsupported");
	}
	if (!root.capabilities.includes("native_commands"))
		throw new Error("Manifest must declare the native_commands capability");
	assertString(root.name, "name", 256);
	if (root.requirements !== undefined) {
		if (
			!root.requirements ||
			typeof root.requirements !== "object" ||
			Array.isArray(root.requirements)
		)
			throw new Error("Invalid manifest requirements");
		const requirements = root.requirements as Record<string, unknown>;
		if (Object.keys(requirements).some((key) => !["os", "gpus"].includes(key)))
			throw new Error("Unsupported manifest requirement");
		for (const [key, value] of Object.entries(requirements)) {
			if (
				!Array.isArray(value) ||
				value.length > 8 ||
				value.some((item) => typeof item !== "string" || item.length > 32)
			)
				throw new Error(`Invalid manifest requirement ${key}`);
		}
	}
	if (
		root.dependencies !== undefined &&
		(!root.dependencies ||
			typeof root.dependencies !== "object" ||
			Array.isArray(root.dependencies) ||
			Object.keys(root.dependencies).length > 64)
	) {
		throw new Error("Invalid manifest dependencies");
	}
	if (root.dependencies && typeof root.dependencies === "object") {
		for (const [name, value] of Object.entries(root.dependencies)) {
			if (
				!/^[A-Za-z0-9_-]{1,64}$/.test(name) ||
				!value ||
				typeof value !== "object" ||
				Array.isArray(value)
			)
				throw new Error("Invalid manifest dependency");
			const dependency = value as Record<string, unknown>;
			if (Object.keys(dependency).some((key) => key !== "version"))
				throw new Error(`Unsupported manifest dependency property for ${name}`);
			assertString(dependency.version, `${name} dependency version`, 128);
		}
	}
	let commandCount = validateSteps(root.installation ?? [], "installation");
	commandCount += validateSteps(root.start ?? [], "start");
	if (commandCount === 0 || commandCount > MAX_COMMANDS)
		throw new Error("Manifest command count is outside allowed bounds");
	return root;
}

function trustStore(): Record<string, string> {
	const raw = import.meta.env.DIONE_PUBLISHER_TRUST_STORE;
	if (!raw)
		throw new Error(
			"The packaged publisher trust store is not configured; remote manifests cannot be trusted",
		);
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			throw new Error();
		const entries = Object.entries(parsed);
		if (
			entries.length === 0 ||
			entries.some(
				([keyId, key]) =>
					!/^[A-Za-z0-9._-]{1,128}$/.test(keyId) ||
					typeof key !== "string" ||
					key.length > 16_384,
			)
		)
			throw new Error();
		return parsed as Record<string, string>;
	} catch {
		throw new Error(
			"DIONE_PUBLISHER_TRUST_STORE must be a JSON object mapping key IDs to Ed25519 public keys",
		);
	}
}

async function verifyAndRecordRemoteManifestWithStore(
	manifestPath: string,
	metadata: RemoteTrustMetadata,
	trustedKeys: () => Record<string, string>,
): Promise<void> {
	if (!/^[a-f0-9]{40}$/i.test(metadata.commit))
		throw new Error(
			"Remote manifest source must specify an immutable 40-character git commit",
		);
	if (!/^[a-f0-9]{64}$/i.test(metadata.manifestSha256))
		throw new Error(
			"Remote manifest metadata is missing a valid SHA-256 digest",
		);
	const bytes = await fs.promises.readFile(manifestPath);
	validateManifestBytes(bytes);
	const actualHash = sha256(bytes);
	if (actualHash !== metadata.manifestSha256.toLowerCase())
		throw new Error(
			"Downloaded manifest SHA-256 does not match publisher metadata",
		);
	const publicKey = trustedKeys()[metadata.publisherKeyId];
	if (!publicKey)
		throw new Error(
			`Publisher key '${metadata.publisherKeyId}' is not in DIONE_PUBLISHER_TRUST_STORE`,
		);
	const signed = `dione-manifest-v1\nsha256:${actualHash}\nsource:${metadata.sourceUrl}\ncommit:${metadata.commit.toLowerCase()}\n`;
	let valid = false;
	try {
		if (
			!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
				metadata.publisherSignature,
			)
		)
			throw new Error();
		const key = createPublicKey(publicKey);
		if (key.asymmetricKeyType !== "ed25519") throw new Error();
		valid = verify(
			null,
			Buffer.from(signed),
			key,
			Buffer.from(metadata.publisherSignature, "base64"),
		);
	} catch {
		throw new Error("Publisher key or Ed25519 signature encoding is invalid");
	}
	if (!valid)
		throw new Error("Publisher Ed25519 signature verification failed");
	await writeReceipt(manifestPath, {
		version: 1,
		classification: "publisher-verified",
		manifestSha256: actualHash,
		verifiedAt: new Date().toISOString(),
		publisherKeyId: metadata.publisherKeyId,
		publisherSignature: metadata.publisherSignature,
		sourceUrl: metadata.sourceUrl,
		commit: metadata.commit.toLowerCase(),
	});
}

async function writeReceipt(
	manifestPath: string,
	receipt: TrustReceipt,
): Promise<void> {
	const receiptPath = path.join(path.dirname(manifestPath), RECEIPT_FILE);
	const temporary = path.join(
		path.dirname(receiptPath),
		`.${RECEIPT_FILE}.${randomUUID()}.tmp`,
	);
	const handle = await fs.promises.open(temporary, "wx", 0o600);
	try {
		await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
	} finally {
		await handle.close();
	}
	try {
		const existing = await fs.promises.lstat(receiptPath).catch(() => null);
		if (existing?.isSymbolicLink())
			throw new Error("Trust receipt symlink rejected");
		await fs.promises.rename(temporary, receiptPath);
	} catch (error) {
		await fs.promises.rm(temporary, { force: true }).catch(() => {});
		throw error;
	}
}

async function readManifestNoFollow(manifestPath: string): Promise<Buffer> {
	const stats = await fs.promises.lstat(manifestPath);
	if (!stats.isFile() || stats.isSymbolicLink())
		throw new Error("Manifest must be a regular, non-symbolic-link file");
	const handle = await fs.promises.open(
		manifestPath,
		fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
	);
	try {
		const opened = await handle.stat();
		if (!opened.isFile() || opened.size > MAX_MANIFEST_BYTES)
			throw new Error("Invalid manifest file");
		return await handle.readFile();
	} finally {
		await handle.close();
	}
}

export async function createLocalApproval(
	manifestPath: string,
): Promise<string> {
	const bytes = await readManifestNoFollow(manifestPath);
	validateManifestBytes(bytes);
	const nonce = randomBytes(32).toString("base64url");
	localApprovalNonces.set(nonce, {
		manifestPath: path.resolve(manifestPath),
		manifestSha256: sha256(bytes),
		expiresAt: Date.now() + 60_000,
	});
	return nonce;
}

export async function consumeLocalApproval(
	manifestPath: string,
	nonce: string,
): Promise<void> {
	const approval = localApprovalNonces.get(nonce);
	localApprovalNonces.delete(nonce);
	if (
		!approval ||
		approval.expiresAt < Date.now() ||
		approval.manifestPath !== path.resolve(manifestPath)
	)
		throw new Error("Local manifest approval is invalid or expired");
	const bytes = await readManifestNoFollow(manifestPath);
	validateManifestBytes(bytes);
	const hash = sha256(bytes);
	if (hash !== approval.manifestSha256)
		throw new Error("Local manifest changed after approval");
	approvedLocalManifestHashes.add(`${path.resolve(manifestPath)}\0${hash}`);
}

async function loadTrustedManifestWithStore(
	manifestPath: string,
	trustedKeys: () => Record<string, string>,
): Promise<Record<string, any>> {
	const bytes = await readManifestNoFollow(manifestPath);
	const manifest = validateManifestBytes(bytes);
	const manifestHash = sha256(bytes);
	if (
		approvedLocalManifestHashes.has(
			`${path.resolve(manifestPath)}\0${manifestHash}`,
		)
	)
		return manifest;
	let receipt: TrustReceipt;
	try {
		receipt = JSON.parse(
			await fs.promises.readFile(
				path.join(path.dirname(manifestPath), RECEIPT_FILE),
				"utf8",
			),
		);
	} catch {
		throw new Error(
			"Manifest has no verified trust receipt; reinstall it or explicitly approve a local import",
		);
	}
	if (
		receipt.version !== 1 ||
		receipt.classification !== "publisher-verified" ||
		receipt.manifestSha256 !== manifestHash
	) {
		throw new Error(
			"Manifest trust receipt is invalid or the manifest changed after verification",
		);
	}
	if (
		!receipt.publisherKeyId ||
		!receipt.publisherSignature ||
		!receipt.sourceUrl ||
		!receipt.commit
	) {
		throw new Error("Publisher trust receipt is incomplete");
	}
	const publicKey = trustedKeys()[receipt.publisherKeyId];
	if (!publicKey)
		throw new Error(
			`Publisher key '${receipt.publisherKeyId}' is no longer trusted`,
		);
	const key = createPublicKey(publicKey);
	if (key.asymmetricKeyType !== "ed25519")
		throw new Error("Publisher key is not Ed25519");
	const signed = `dione-manifest-v1\nsha256:${receipt.manifestSha256}\nsource:${receipt.sourceUrl}\ncommit:${receipt.commit}\n`;
	if (
		!verify(
			null,
			Buffer.from(signed),
			key,
			Buffer.from(receipt.publisherSignature, "base64"),
		)
	)
		throw new Error("Publisher trust receipt signature is invalid");
	return manifest;
}

export function createManifestTrust(trustedKeys: Record<string, string>) {
	const store = Object.freeze({ ...trustedKeys });
	return Object.freeze({
		verifyAndRecordRemoteManifest: (
			manifestPath: string,
			metadata: RemoteTrustMetadata,
		) =>
			verifyAndRecordRemoteManifestWithStore(
				manifestPath,
				metadata,
				() => store,
			),
		loadTrustedManifest: (manifestPath: string) =>
			loadTrustedManifestWithStore(manifestPath, () => store),
	});
}

export function verifyAndRecordRemoteManifest(
	manifestPath: string,
	metadata: RemoteTrustMetadata,
): Promise<void> {
	return verifyAndRecordRemoteManifestWithStore(
		manifestPath,
		metadata,
		trustStore,
	);
}

export function loadTrustedManifest(
	manifestPath: string,
): Promise<Record<string, any>> {
	return loadTrustedManifestWithStore(manifestPath, trustStore);
}
