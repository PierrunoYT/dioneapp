import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createInflateRaw } from "node:zlib";

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_ARCHIVE_MEMBERS = 20_000;
const DEFAULT_MAX_EXPANDED_BYTES = 16 * 1024 * 1024 * 1024;
const DEFAULT_MAX_MEMBER_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_ZIP_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_TAR_METADATA_BYTES = 1024 * 1024;

export const GITHUB_RELEASE_HOSTS = [
	"github.com",
	"objects.githubusercontent.com",
	"release-assets.githubusercontent.com",
] as const;

export type ArchiveFormat = "tar.gz" | "tar.zst" | "zip";

export interface ArchiveLimits {
	maxMembers?: number;
	maxExpandedBytes?: number;
	maxMemberBytes?: number;
}

interface Sha256Verification {
	type: "sha256";
	sha256: string;
}

interface AuthenticodeVerification {
	type: "authenticode";
	publishers: readonly string[];
}

export interface ArtifactMetadata {
	id: string;
	version: string;
	url: string;
	allowedHosts: readonly string[];
	verification: Sha256Verification | AuthenticodeVerification;
	maxDownloadBytes?: number;
	archive?: {
		format: ArchiveFormat;
		limits?: ArchiveLimits;
		allowSymlinks?: boolean;
	};
}

interface DownloadOptions {
	signal?: AbortSignal;
	onProgress?: (progress: number) => void;
}

function assertArtifactMetadata(artifact: ArtifactMetadata): void {
	if (!artifact.id.trim() || !artifact.version.trim()) {
		throw new Error("Artifact integrity metadata is incomplete.");
	}
	if (artifact.allowedHosts.length === 0) {
		throw new Error(`Artifact ${artifact.id} has no trusted download hosts.`);
	}
	if (artifact.verification.type === "sha256") {
		if (!/^[a-f\d]{64}$/i.test(artifact.verification.sha256)) {
			throw new Error(`Artifact ${artifact.id} has no valid SHA-256 digest.`);
		}
	} else if (artifact.verification.publishers.length === 0) {
		throw new Error(
			`Artifact ${artifact.id} has no trusted signature publisher.`,
		);
	}
}

function validateDownloadUrl(url: URL, artifact: ArtifactMetadata): void {
	if (url.protocol !== "https:") {
		throw new Error(`Refusing non-HTTPS artifact URL for ${artifact.id}.`);
	}
	const hostname = url.hostname.toLowerCase();
	if (!artifact.allowedHosts.some((host) => host.toLowerCase() === hostname)) {
		throw new Error(
			`Refusing untrusted download host ${url.hostname} for ${artifact.id}.`,
		);
	}
	if (url.username || url.password) {
		throw new Error(
			`Refusing artifact URL with credentials for ${artifact.id}.`,
		);
	}
}

function requestArtifact(
	url: URL,
	artifact: ArtifactMetadata,
	signal?: AbortSignal,
	redirectCount = 0,
): Promise<import("node:http").IncomingMessage> {
	validateDownloadUrl(url, artifact);
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Aborted"));
			return;
		}

		const request = https.get(
			url,
			{
				headers: {
					Accept: "application/octet-stream",
					"User-Agent": "DioneApp/1.1 (verified dependency installer)",
				},
				signal,
			},
			(response) => {
				const statusCode = response.statusCode ?? 0;
				if ([301, 302, 303, 307, 308].includes(statusCode)) {
					const location = response.headers.location;
					response.resume();
					if (!location) {
						reject(
							new Error(`Redirect without a location for ${artifact.id}.`),
						);
						return;
					}
					if (redirectCount >= MAX_REDIRECTS) {
						reject(new Error(`Too many redirects for ${artifact.id}.`));
						return;
					}
					let redirectUrl: URL;
					try {
						redirectUrl = new URL(location, url);
						validateDownloadUrl(redirectUrl, artifact);
					} catch (error) {
						reject(error);
						return;
					}
					requestArtifact(
						redirectUrl,
						artifact,
						signal,
						redirectCount + 1,
					).then(resolve, reject);
					return;
				}

				if (statusCode !== 200) {
					response.resume();
					reject(
						new Error(`HTTP ${statusCode} while downloading ${artifact.id}.`),
					);
					return;
				}
				resolve(response);
			},
		);
		request.on("error", reject);
	});
}

function equalHexDigest(actual: string, expected: string): boolean {
	const actualBuffer = Buffer.from(actual, "hex");
	const expectedBuffer = Buffer.from(expected, "hex");
	return (
		actualBuffer.length === expectedBuffer.length &&
		timingSafeEqual(actualBuffer, expectedBuffer)
	);
}

export async function verifyFileSha256(
	filePath: string,
	expectedSha256: string,
): Promise<void> {
	if (!/^[a-f\d]{64}$/i.test(expectedSha256)) {
		throw new Error("SHA-256 integrity metadata is unavailable or invalid.");
	}
	const hash = createHash("sha256");
	for await (const chunk of fs.createReadStream(filePath)) {
		hash.update(chunk);
	}
	const actual = hash.digest("hex");
	if (!equalHexDigest(actual, expectedSha256)) {
		throw new Error(
			`SHA-256 mismatch: expected ${expectedSha256.toLowerCase()}, received ${actual}.`,
		);
	}
}

async function verifyAuthenticodeSignature(
	filePath: string,
	publishers: readonly string[],
): Promise<void> {
	if (process.platform !== "win32") {
		throw new Error("Authenticode verification is only available on Windows.");
	}
	if (publishers.length === 0) {
		throw new Error("Authenticode publisher metadata is unavailable.");
	}

	const encodedPath = Buffer.from(filePath, "utf8").toString("base64");
	const script = [
		`$path = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("${encodedPath}"))`,
		"$signature = Get-AuthenticodeSignature -LiteralPath $path",
		"if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate) { exit 10 }",
		"[Console]::Out.Write($signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false))",
	].join("; ");

	const subject = await new Promise<string>((resolve, reject) => {
		const child = spawn(
			"powershell.exe",
			["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
			{ shell: false, windowsHide: true },
		);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (data) => {
			stdout += data.toString();
		});
		child.stderr.on("data", (data) => {
			stderr += data.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve(stdout.trim());
			else
				reject(
					new Error(`Authenticode verification failed (${code}): ${stderr}`),
				);
		});
	});

	if (!publishers.some((publisher) => subject === publisher)) {
		throw new Error(`Unexpected Authenticode signer: ${subject || "none"}.`);
	}
}

export async function downloadVerifiedArtifact(
	artifact: ArtifactMetadata,
	destinationPath: string,
	options: DownloadOptions = {},
): Promise<void> {
	assertArtifactMetadata(artifact);
	const initialUrl = new URL(artifact.url);
	validateDownloadUrl(initialUrl, artifact);
	await fsp.mkdir(path.dirname(destinationPath), {
		recursive: true,
		mode: 0o700,
	});

	const partialPath = `${destinationPath}.${randomUUID()}.part`;
	const response = await requestArtifact(initialUrl, artifact, options.signal);
	const maxBytes = artifact.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
	const contentLength = Number(response.headers["content-length"] ?? 0);
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		response.destroy();
		throw new Error(`Artifact ${artifact.id} exceeds its download size limit.`);
	}

	let downloadedBytes = 0;
	const hash =
		artifact.verification.type === "sha256" ? createHash("sha256") : undefined;
	const meter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			downloadedBytes += chunk.length;
			if (downloadedBytes > maxBytes) {
				callback(
					new Error(`Artifact ${artifact.id} exceeds its download size limit.`),
				);
				return;
			}
			hash?.update(chunk);
			if (contentLength > 0) {
				options.onProgress?.(downloadedBytes / contentLength);
			}
			callback(null, chunk);
		},
	});

	try {
		await pipeline(
			response,
			meter,
			fs.createWriteStream(partialPath, { flags: "wx", mode: 0o600 }),
		);
		if (downloadedBytes === 0) {
			throw new Error(`Artifact ${artifact.id} downloaded zero bytes.`);
		}

		if (artifact.verification.type === "sha256") {
			const actual = hash?.digest("hex") ?? "";
			if (!equalHexDigest(actual, artifact.verification.sha256)) {
				throw new Error(
					`SHA-256 mismatch for ${artifact.id}: expected ${artifact.verification.sha256.toLowerCase()}, received ${actual}.`,
				);
			}
		} else {
			await verifyAuthenticodeSignature(
				partialPath,
				artifact.verification.publishers,
			);
		}

		await fsp.rm(destinationPath, { force: true });
		await fsp.rename(partialPath, destinationPath);
	} catch (error) {
		response.destroy();
		await fsp.rm(partialPath, { force: true }).catch(() => {});
		throw error;
	}
}

export async function createPrivateStagingDirectory(
	parentDirectory: string,
	prefix: string,
): Promise<string> {
	await fsp.mkdir(parentDirectory, { recursive: true, mode: 0o700 });
	const stagingDirectory = await fsp.mkdtemp(
		path.join(parentDirectory, prefix),
	);
	await fsp.chmod(stagingDirectory, 0o700);
	return stagingDirectory;
}

function validateMemberPath(memberPath: string): string {
	if (
		!memberPath ||
		memberPath.includes("\0") ||
		/[\x01-\x1f\x7f]/.test(memberPath)
	) {
		throw new Error("Archive contains an invalid member name.");
	}
	const portablePath = memberPath.replace(/\\/g, "/");
	if (
		path.posix.isAbsolute(portablePath) ||
		portablePath.startsWith("//") ||
		/^[a-zA-Z]:/.test(portablePath)
	) {
		throw new Error(`Archive contains an absolute member path: ${memberPath}.`);
	}
	if (portablePath.split("/").includes("..")) {
		throw new Error(`Archive contains a traversal member path: ${memberPath}.`);
	}
	const normalized = path.posix.normalize(portablePath.replace(/^\.\//, ""));
	return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function archiveLimits(limits: ArchiveLimits = {}): Required<ArchiveLimits> {
	return {
		maxMembers: limits.maxMembers ?? DEFAULT_MAX_ARCHIVE_MEMBERS,
		maxExpandedBytes: limits.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED_BYTES,
		maxMemberBytes: limits.maxMemberBytes ?? DEFAULT_MAX_MEMBER_BYTES,
	};
}

class StreamReader {
	private readonly iterator: AsyncIterator<Buffer | string>;
	private buffered: Buffer = Buffer.alloc(0);
	private ended = false;

	constructor(stream: Readable) {
		this.iterator = stream[Symbol.asyncIterator]();
	}

	private async fill(length: number): Promise<void> {
		while (this.buffered.length < length && !this.ended) {
			const next = await this.iterator.next();
			if (next.done) {
				this.ended = true;
				break;
			}
			const chunk = Buffer.isBuffer(next.value)
				? next.value
				: Buffer.from(next.value);
			this.buffered =
				this.buffered.length === 0
					? chunk
					: Buffer.concat([this.buffered, chunk]);
		}
	}

	async read(length: number): Promise<Buffer | undefined> {
		await this.fill(length);
		if (this.buffered.length === 0 && this.ended) return undefined;
		if (this.buffered.length < length) {
			throw new Error("Archive ended before the current member was complete.");
		}
		const result = this.buffered.subarray(0, length);
		this.buffered = this.buffered.subarray(length);
		return result;
	}

	async skip(length: number): Promise<void> {
		let remaining = length;
		while (remaining > 0) {
			const amount = Math.min(remaining, 64 * 1024);
			const chunk = await this.read(amount);
			if (!chunk) throw new Error("Archive member data is truncated.");
			remaining -= chunk.length;
		}
	}
}

function readTarString(buffer: Buffer): string {
	const nul = buffer.indexOf(0);
	return buffer.subarray(0, nul === -1 ? buffer.length : nul).toString("utf8");
}

function readTarNumber(buffer: Buffer, field: string): number {
	if ((buffer[0] & 0x80) !== 0) {
		throw new Error(`Archive uses an unsupported binary ${field} field.`);
	}
	const value = readTarString(buffer).trim();
	if (!value) return 0;
	if (!/^[0-7]+$/.test(value)) {
		throw new Error(`Archive contains an invalid ${field} field.`);
	}
	const parsed = Number.parseInt(value, 8);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`Archive contains an unsafe ${field} value.`);
	}
	return parsed;
}

function verifyTarHeaderChecksum(header: Buffer): void {
	const expected = readTarNumber(header.subarray(148, 156), "checksum");
	let actual = 0;
	for (let index = 0; index < header.length; index += 1) {
		actual += index >= 148 && index < 156 ? 0x20 : header[index];
	}
	if (actual !== expected) {
		throw new Error("Archive contains an invalid tar header checksum.");
	}
}

function parsePaxAttributes(payload: Buffer): Record<string, string> {
	const attributes: Record<string, string> = {};
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let offset = 0;
	while (offset < payload.length) {
		const separator = payload.indexOf(0x20, offset);
		if (separator === -1)
			throw new Error("Archive contains invalid PAX metadata.");
		const lengthText = payload.toString("ascii", offset, separator);
		if (!/^[1-9][0-9]*$/.test(lengthText))
			throw new Error("Archive contains invalid PAX metadata length.");
		const length = Number(lengthText);
		if (
			!Number.isSafeInteger(length) ||
			length < separator - offset + 4 ||
			offset + length > payload.length
		) {
			throw new Error("Archive contains invalid PAX metadata length.");
		}
		if (payload[offset + length - 1] !== 0x0a)
			throw new Error("Archive contains invalid PAX metadata newline.");
		const recordBytes = payload.subarray(separator + 1, offset + length - 1);
		const equals = recordBytes.indexOf(0x3d);
		if (equals <= 0) throw new Error("Archive contains invalid PAX metadata.");
		const keyBytes = recordBytes.subarray(0, equals);
		if (keyBytes.some((byte) => byte > 0x7f))
			throw new Error("Archive contains a non-ASCII PAX metadata key.");
		const key = keyBytes.toString("ascii");
		if (!/^[A-Za-z0-9_.-]+$/.test(key))
			throw new Error("Archive contains an invalid PAX metadata key.");
		let value: string;
		try {
			value = decoder.decode(recordBytes.subarray(equals + 1));
		} catch {
			if (
				!key.startsWith("LIBARCHIVE.xattr.") &&
				!key.startsWith("SCHILY.xattr.")
			)
				throw new Error("Archive contains invalid UTF-8 PAX metadata.");
			value = "<opaque-xattr>";
		}
		if (Object.hasOwn(attributes, key))
			throw new Error(`Archive contains duplicate PAX metadata key: ${key}.`);
		attributes[key] = value;
		offset += length;
	}
	return attributes;
}

interface TarMember {
	name: string;
	type: "file" | "directory" | "symlink";
	size?: number;
	linkTarget?: string;
}

interface TarManifest {
	members: Map<string, TarMember>;
}

interface ZipMember extends TarMember {
	dataOffset: number;
	compressedSize: number;
	method: number;
	crc: number;
	mode: number;
}

interface ZipManifest extends TarManifest {
	members: Map<string, ZipMember>;
}

function maximumTarContainerBytes(limitsInput?: ArchiveLimits): number {
	const limits = archiveLimits(limitsInput);
	return limits.maxExpandedBytes + limits.maxMembers * 1024 + 1024;
}

async function preflightTarStream(
	source: Readable,
	limitsInput?: ArchiveLimits,
	allowSymlinks = false,
): Promise<TarManifest> {
	const limits = archiveLimits(limitsInput);
	const reader = new StreamReader(source);
	let memberCount = 0;
	let expandedBytes = 0;
	let pendingLongName: string | undefined;
	let pendingPax: Record<string, string> = {};
	const names = new Set<string>();
	const members = new Map<string, TarMember>();

	try {
		while (true) {
			const header = await reader.read(512);
			if (!header)
				throw new Error("Tar archive is missing its zero end blocks.");
			if (header.every((byte) => byte === 0)) {
				if (pendingLongName !== undefined || Object.keys(pendingPax).length > 0)
					throw new Error("Tar archive ends with unapplied path metadata.");
				const second = await reader.read(512);
				if (!second || !second.every((byte) => byte === 0))
					throw new Error("Tar archive is missing its second zero end block.");
				let trailing = await reader.read(512);
				while (trailing) {
					if (!trailing.every((byte) => byte === 0))
						throw new Error("Tar archive contains nonzero trailing data.");
					trailing = await reader.read(512);
				}
				break;
			}
			verifyTarHeaderChecksum(header);
			const headerSize = readTarNumber(header.subarray(124, 136), "size");
			const type = String.fromCharCode(header[156] || 0);
			const signature = header.subarray(257, 265);
			const isPosixUstar = signature.equals(
				Buffer.from(`ustar${String.fromCharCode(0)}00`, "ascii"),
			);
			if (!isPosixUstar && !signature.equals(Buffer.alloc(8))) {
				throw new Error(
					"Archive contains an unsupported tar header signature.",
				);
			}
			const prefix = isPosixUstar
				? readTarString(header.subarray(345, 500))
				: "";
			const headerName = readTarString(header.subarray(0, 100));
			const rawName = prefix ? `${prefix}/${headerName}` : headerName;
			memberCount += 1;
			if (memberCount > limits.maxMembers) {
				throw new Error("Archive contains too many members.");
			}
			if (headerSize > limits.maxMemberBytes) {
				throw new Error(`Archive member ${rawName} exceeds its size limit.`);
			}
			expandedBytes += headerSize;
			if (expandedBytes > limits.maxExpandedBytes) {
				throw new Error("Archive exceeds its expanded size limit.");
			}

			if (["L", "K", "x", "g"].includes(type)) {
				if (headerSize > MAX_TAR_METADATA_BYTES) {
					throw new Error("Archive contains excessive tar metadata.");
				}
				const payload = (await reader.read(headerSize)) ?? Buffer.alloc(0);
				if (type === "L") {
					if (
						pendingLongName !== undefined ||
						Object.keys(pendingPax).length > 0
					)
						throw new Error(
							"Archive contains mixed or repeated path metadata.",
						);
					pendingLongName = readTarString(payload);
				} else if (type === "K") {
					throw new Error("Archive contains a link target entry.");
				} else if (type === "x") {
					if (
						pendingLongName !== undefined ||
						Object.keys(pendingPax).length > 0
					)
						throw new Error(
							"Archive contains mixed or repeated path metadata.",
						);
					pendingPax = parsePaxAttributes(payload);
				} else {
					throw new Error("Archive contains unsupported global PAX metadata.");
				}
				await reader.skip((512 - (headerSize % 512)) % 512);
				continue;
			}

			const pax = pendingPax;
			const memberName = pax.path ?? pendingLongName ?? rawName;
			pendingLongName = undefined;
			pendingPax = {};
			if (
				Object.keys(pax).some((key) => key.toLowerCase().includes("sparse"))
			) {
				throw new Error("Archive contains unsupported sparse tar metadata.");
			}
			if (pax.size !== undefined) {
				if (!/^(0|[1-9][0-9]*)$/.test(pax.size))
					throw new Error("Archive contains invalid PAX size metadata.");
				const paxSize = BigInt(pax.size);
				if (
					paxSize > BigInt(Number.MAX_SAFE_INTEGER) ||
					Number(paxSize) !== headerSize
				)
					throw new Error("Archive contains inconsistent PAX size metadata.");
			}

			if (
				!["\0", "0", "2", "5"].includes(type) ||
				(type === "2" && !allowSymlinks)
			) {
				throw new Error(
					`Archive contains a link or special tar entry (${type}).`,
				);
			}
			const normalizedName = validateMemberPath(memberName);
			const comparisonName = normalizedName.toLocaleLowerCase("en-US");
			if (names.has(comparisonName)) {
				throw new Error(`Archive contains a duplicate member: ${memberName}.`);
			}
			names.add(comparisonName);
			const memberType =
				type === "5" ? "directory" : type === "2" ? "symlink" : "file";
			const headerLinkTarget = readTarString(header.subarray(157, 257));
			const linkTarget = pax.linkpath ?? headerLinkTarget;
			if (memberType === "symlink") {
				if (
					!linkTarget ||
					path.posix.isAbsolute(linkTarget.replace(/\\/g, "/")) ||
					/^[a-zA-Z]:/.test(linkTarget) ||
					linkTarget.includes("\0") ||
					/[\x01-\x1f\x7f]/.test(linkTarget)
				) {
					throw new Error(
						`Archive symlink ${memberName} has an invalid target.`,
					);
				}
			} else if (linkTarget) {
				throw new Error("Archive contains a link target on a non-link entry.");
			}
			members.set(comparisonName, {
				name: normalizedName,
				type: memberType,
				...(memberType === "file" ? { size: headerSize } : {}),
				...(memberType === "symlink" ? { linkTarget } : {}),
			});

			await reader.skip(headerSize + ((512 - (headerSize % 512)) % 512));
		}
		validateTarSymlinks(members);
		return { members };
	} finally {
		source.destroy();
	}
}

function validateTarSymlinks(members: Map<string, TarMember>): void {
	const key = (name: string): string => name.toLocaleLowerCase("en-US");
	const implicitDirectories = new Set<string>();
	for (const member of members.values()) {
		const parts = member.name.split("/");
		for (let index = 1; index < parts.length; index += 1) {
			const parent = parts.slice(0, index).join("/");
			implicitDirectories.add(key(parent));
			if (members.get(key(parent))?.type === "symlink") {
				throw new Error(
					`Archive member ${member.name} traverses through a symlink ancestor.`,
				);
			}
		}
	}

	const resolving = new Set<string>();
	const resolve = (member: TarMember): TarMember | "directory" => {
		if (member.type !== "symlink") return member;
		const memberKey = key(member.name);
		if (resolving.has(memberKey))
			throw new Error("Archive contains a symlink cycle.");
		resolving.add(memberKey);
		const portableTarget = member.linkTarget?.replace(/\\/g, "/") ?? "";
		const resolvedName = path.posix.normalize(
			path.posix.join(path.posix.dirname(member.name), portableTarget),
		);
		if (
			resolvedName === ".." ||
			resolvedName.startsWith("../") ||
			path.posix.isAbsolute(resolvedName)
		) {
			throw new Error(
				`Archive symlink ${member.name} escapes the archive root.`,
			);
		}
		const target = members.get(key(resolvedName));
		let result: TarMember | "directory";
		if (target) result = resolve(target);
		else if (implicitDirectories.has(key(resolvedName))) result = "directory";
		else
			throw new Error(`Archive symlink ${member.name} has a dangling target.`);
		resolving.delete(memberKey);
		return result;
	};
	for (const member of members.values())
		if (member.type === "symlink") resolve(member);
}

async function preflightPlainTar(
	archivePath: string,
	limits?: ArchiveLimits,
	allowSymlinks = false,
): Promise<TarManifest> {
	return preflightTarStream(
		fs.createReadStream(archivePath),
		limits,
		allowSymlinks,
	);
}

async function preflightTarGz(
	archivePath: string,
	limits?: ArchiveLimits,
	allowSymlinks = false,
): Promise<TarManifest> {
	const input = fs.createReadStream(archivePath);
	const gunzip = createGunzip();
	let decompressedBytes = 0;
	const meter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			decompressedBytes += chunk.length;
			if (decompressedBytes > maximumTarContainerBytes(limits))
				callback(
					new Error("Gzip archive exceeds its decompressed size limit."),
				);
			else callback(null, chunk);
		},
	});
	input.pipe(gunzip).pipe(meter);
	try {
		return await preflightTarStream(meter, limits, allowSymlinks);
	} finally {
		input.destroy();
		gunzip.destroy();
		meter.destroy();
	}
}

async function decompressZstdToTar(
	archivePath: string,
	tarPath: string,
	limitsInput?: ArchiveLimits,
): Promise<void> {
	const maximumTarBytes = maximumTarContainerBytes(limitsInput);
	let outputBytes = 0;
	const decoder = spawn("zstd", ["-dc", "-M128MB", "--", archivePath], {
		shell: false,
		windowsHide: true,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stderr = "";
	decoder.stderr.on("data", (data) => {
		if (stderr.length < 16_384) stderr += data.toString();
	});
	const completed = new Promise<void>((resolve, reject) => {
		decoder.on("error", reject);
		decoder.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Zstandard decoder failed (${code}): ${stderr}`));
		});
	});
	const meter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			outputBytes += chunk.byteLength;
			if (outputBytes > maximumTarBytes) {
				callback(
					new Error("Zstandard archive exceeds its decompressed size limit."),
				);
				return;
			}
			callback(null, chunk);
		},
	});
	try {
		await Promise.all([
			pipeline(
				decoder.stdout,
				meter,
				fs.createWriteStream(tarPath, { flags: "wx", mode: 0o600 }),
			),
			completed,
		]);
	} catch (error) {
		decoder.kill();
		await fsp.rm(tarPath, { force: true });
		throw new Error("Invalid or oversized Zstandard archive.", {
			cause: error,
		});
	}
}

function decodeZipName(bytes: Buffer, flags: number): string {
	if ((flags & 0x800) === 0 && bytes.some((byte) => byte > 0x7f)) {
		throw new Error("Archive contains a non-UTF-8 legacy zip member name.");
	}
	if ((flags & 0x800) === 0) return bytes.toString("ascii");
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error("Archive contains an invalid UTF-8 zip member name.");
	}
}

function validateZipExtraFields(extra: Buffer): void {
	let offset = 0;
	while (offset < extra.length) {
		if (offset + 4 > extra.length)
			throw new Error("Zip archive contains a truncated extra field.");
		const id = extra.readUInt16LE(offset);
		const length = extra.readUInt16LE(offset + 2);
		offset += 4;
		if (offset + length > extra.length)
			throw new Error("Zip archive contains an invalid extra field length.");
		if (id === 0x7075)
			throw new Error("Zip archive contains a Unicode path extra field.");
		if (![0x000a, 0x5455, 0x7875].includes(id))
			throw new Error(
				`Zip archive contains unsupported extra field 0x${id.toString(16)}.`,
			);
		if (id === 0x5455) {
			const flags = extra[offset];
			const availableTimestamps =
				(flags & 1) + ((flags >> 1) & 1) + ((flags >> 2) & 1);
			const storedTimestamps = (length - 1) / 4;
			if (
				length < 1 ||
				!Number.isInteger(storedTimestamps) ||
				storedTimestamps > availableTimestamps ||
				(flags & ~7) !== 0
			)
				throw new Error("Zip archive contains invalid timestamp metadata.");
		}
		if (id === 0x7875) {
			const uidLength = extra[offset + 1] ?? 0;
			const gidLengthOffset = offset + 2 + uidLength;
			const gidLength = extra[gidLengthOffset] ?? 0;
			if (
				length < 3 ||
				extra[offset] !== 1 ||
				uidLength < 1 ||
				uidLength > 8 ||
				gidLength < 1 ||
				gidLength > 8 ||
				3 + uidLength + gidLength !== length
			)
				throw new Error("Zip archive contains invalid UID/GID metadata.");
		}
		if (id === 0x000a) {
			if (
				length < 4 ||
				!extra.subarray(offset, offset + 4).equals(Buffer.alloc(4))
			)
				throw new Error("Zip archive contains invalid NTFS metadata.");
			let attributeOffset = offset + 4;
			while (attributeOffset < offset + length) {
				if (attributeOffset + 4 > offset + length)
					throw new Error("Zip archive contains truncated NTFS metadata.");
				const tag = extra.readUInt16LE(attributeOffset);
				const attributeLength = extra.readUInt16LE(attributeOffset + 2);
				attributeOffset += 4;
				if (
					tag !== 1 ||
					attributeLength !== 24 ||
					attributeOffset + attributeLength > offset + length
				)
					throw new Error("Zip archive contains unsupported NTFS metadata.");
				attributeOffset += attributeLength;
			}
		}
		offset += length;
	}
}

async function readFileRange(
	handle: fsp.FileHandle,
	length: number,
	position: number,
): Promise<Buffer> {
	const buffer = Buffer.alloc(length);
	const { bytesRead } = await handle.read(buffer, 0, length, position);
	if (bytesRead !== length) throw new Error("Zip archive is truncated.");
	return buffer;
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
	let crc = value;
	for (let bit = 0; bit < 8; bit += 1)
		crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	return crc >>> 0;
});

async function validateZipMemberData(
	archivePath: string,
	member: ZipMember,
	limits: Required<ArchiveLimits>,
	aggregate: { bytes: number },
	destinationPath?: string,
): Promise<void> {
	let actualSize = 0;
	let crc = 0xffffffff;
	const verifier = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			actualSize += chunk.length;
			aggregate.bytes += chunk.length;
			if (
				actualSize > limits.maxMemberBytes ||
				aggregate.bytes > limits.maxExpandedBytes ||
				actualSize > (member.size ?? 0)
			) {
				callback(
					new Error(`Zip member ${member.name} exceeds its actual size limit.`),
				);
				return;
			}
			for (const byte of chunk)
				crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
			callback(null, chunk);
		},
	});
	const compressed =
		member.compressedSize === 0
			? Readable.from([])
			: fs.createReadStream(archivePath, {
					start: member.dataOffset,
					end: member.dataOffset + member.compressedSize - 1,
				});
	const streams: Parameters<typeof pipeline> =
		member.method === 8
			? [compressed, createInflateRaw(), verifier]
			: [compressed, verifier];
	if (destinationPath)
		streams.push(
			fs.createWriteStream(destinationPath, { flags: "wx", mode: 0o600 }),
		);
	else
		streams.push(
			new Writable({
				write(_chunk, _encoding, callback) {
					callback();
				},
			}),
		);
	try {
		await pipeline(...streams);
	} finally {
		compressed.destroy();
		verifier.destroy();
	}
	if (actualSize !== member.size)
		throw new Error(
			`Zip member ${member.name} actual expanded size does not match metadata.`,
		);
	if ((crc ^ 0xffffffff) >>> 0 !== member.crc)
		throw new Error(
			`Zip member ${member.name} CRC-32 does not match metadata.`,
		);
}

async function preflightZip(
	archivePath: string,
	limitsInput?: ArchiveLimits,
): Promise<ZipManifest> {
	const limits = archiveLimits(limitsInput);
	const handle = await fsp.open(archivePath, "r");
	try {
		const stat = await handle.stat();
		const tailLength = Math.min(stat.size, 65_557);
		const tail = await readFileRange(
			handle,
			tailLength,
			stat.size - tailLength,
		);
		let eocdOffset = -1;
		for (let index = tail.length - 22; index >= 0; index -= 1) {
			if (
				tail.readUInt32LE(index) === 0x06054b50 &&
				index + 22 + tail.readUInt16LE(index + 20) === tail.length
			) {
				eocdOffset = index;
				break;
			}
		}
		if (eocdOffset === -1) throw new Error("Zip archive has no end record.");
		const absoluteEocdOffset = stat.size - tailLength + eocdOffset;

		const disk = tail.readUInt16LE(eocdOffset + 4);
		const centralDisk = tail.readUInt16LE(eocdOffset + 6);
		const diskEntries = tail.readUInt16LE(eocdOffset + 8);
		const totalEntries = tail.readUInt16LE(eocdOffset + 10);
		const centralSize = tail.readUInt32LE(eocdOffset + 12);
		const centralOffset = tail.readUInt32LE(eocdOffset + 16);
		if (
			disk !== 0 ||
			centralDisk !== 0 ||
			diskEntries !== totalEntries ||
			totalEntries === 0xffff ||
			centralSize === 0xffffffff ||
			centralOffset === 0xffffffff
		) {
			throw new Error("Multi-disk and Zip64 archives are not supported.");
		}
		if (totalEntries > limits.maxMembers) {
			throw new Error("Archive contains too many members.");
		}
		if (
			centralSize > MAX_ZIP_CENTRAL_DIRECTORY_BYTES ||
			centralOffset + centralSize !== absoluteEocdOffset
		) {
			throw new Error("Zip central directory has invalid bounds.");
		}

		const central = await readFileRange(handle, centralSize, centralOffset);
		let offset = 0;
		let expandedBytes = 0;
		const names = new Set<string>();
		const members = new Map<string, ZipMember>();
		const memberRanges: Array<[number, number]> = [];
		for (let entry = 0; entry < totalEntries; entry += 1) {
			if (
				offset + 46 > central.length ||
				central.readUInt32LE(offset) !== 0x02014b50
			) {
				throw new Error("Zip central directory is malformed.");
			}
			const flags = central.readUInt16LE(offset + 8);
			const method = central.readUInt16LE(offset + 10);
			const compressedSize = central.readUInt32LE(offset + 20);
			const expandedSize = central.readUInt32LE(offset + 24);
			const nameLength = central.readUInt16LE(offset + 28);
			const extraLength = central.readUInt16LE(offset + 30);
			const commentLength = central.readUInt16LE(offset + 32);
			const externalAttributes = central.readUInt32LE(offset + 38);
			const localOffset = central.readUInt32LE(offset + 42);
			const crc = central.readUInt32LE(offset + 16);
			const entryLength = 46 + nameLength + extraLength + commentLength;
			if (offset + entryLength > central.length) {
				throw new Error("Zip central directory member is truncated.");
			}
			if (
				compressedSize === 0xffffffff ||
				expandedSize === 0xffffffff ||
				localOffset === 0xffffffff
			) {
				throw new Error("Zip64 archive members are not supported.");
			}
			if (
				(flags & ~(0x800 | 0x6)) !== 0 ||
				(method !== 8 && (flags & 0x6) !== 0)
			)
				throw new Error("Zip archive uses unsupported general-purpose flags.");
			if (![0, 8].includes(method)) {
				throw new Error(
					`Zip archive uses unsupported compression method ${method}.`,
				);
			}
			if (method === 0 && compressedSize !== expandedSize)
				throw new Error(
					"Stored zip member compressed and expanded sizes differ.",
				);

			const nameBytes = central.subarray(offset + 46, offset + 46 + nameLength);
			validateZipExtraFields(
				central.subarray(
					offset + 46 + nameLength,
					offset + 46 + nameLength + extraLength,
				),
			);
			const memberName = decodeZipName(nameBytes, flags);
			const normalizedName = validateMemberPath(memberName);
			const comparisonName = normalizedName.toLocaleLowerCase("en-US");
			if (names.has(comparisonName)) {
				throw new Error(`Archive contains a duplicate member: ${memberName}.`);
			}
			names.add(comparisonName);

			const unixMode = externalAttributes >>> 16;
			const unixType = unixMode & 0o170000;
			const isDirectory =
				memberName.endsWith("/") || (externalAttributes & 0x10) !== 0;
			if (unixType !== 0 && unixType !== (isDirectory ? 0o040000 : 0o100000)) {
				throw new Error(
					`Archive contains a link or special zip entry: ${memberName}.`,
				);
			}
			if ((externalAttributes & 0x400) !== 0) {
				throw new Error(
					`Archive contains a Windows reparse-point entry: ${memberName}.`,
				);
			}
			if (expandedSize > limits.maxMemberBytes) {
				throw new Error(`Archive member ${memberName} exceeds its size limit.`);
			}
			expandedBytes += expandedSize;
			if (expandedBytes > limits.maxExpandedBytes) {
				throw new Error("Archive exceeds its expanded size limit.");
			}
			if (
				expandedSize > 100 * 1024 * 1024 &&
				compressedSize > 0 &&
				expandedSize / compressedSize > 1000
			) {
				throw new Error(
					`Archive member ${memberName} has an excessive compression ratio.`,
				);
			}

			if (localOffset + 30 > centralOffset) {
				throw new Error("Zip local member header exceeds its bounds.");
			}
			const localFixed = await readFileRange(handle, 30, localOffset);
			const localNameLength = localFixed.readUInt16LE(26);
			const localExtraLength = localFixed.readUInt16LE(28);
			const localHeader = await readFileRange(
				handle,
				30 + localNameLength + localExtraLength,
				localOffset,
			);
			if (localHeader.readUInt32LE(0) !== 0x04034b50) {
				throw new Error("Zip local member header is malformed.");
			}
			const localFlags = localHeader.readUInt16LE(6);
			const localMethod = localHeader.readUInt16LE(8);
			const localCrc = localHeader.readUInt32LE(14);
			const localCompressedSize = localHeader.readUInt32LE(18);
			const localExpandedSize = localHeader.readUInt32LE(22);
			if (
				localFlags !== flags ||
				localMethod !== method ||
				localCrc !== crc ||
				localCompressedSize !== compressedSize ||
				localExpandedSize !== expandedSize ||
				localNameLength !== nameLength ||
				!localHeader.subarray(30, 30 + localNameLength).equals(nameBytes)
			) {
				throw new Error("Zip local and central member metadata do not match.");
			}
			validateZipExtraFields(localHeader.subarray(30 + localNameLength));
			const dataStart = localOffset + 30 + localNameLength + localExtraLength;
			const dataEnd = dataStart + compressedSize;
			if (dataEnd > centralOffset)
				throw new Error("Zip member data exceeds its bounds.");
			if (
				memberRanges.some(
					([start, end]) => localOffset < end && dataEnd > start,
				)
			) {
				throw new Error("Zip archive contains overlapping members.");
			}
			memberRanges.push([localOffset, dataEnd]);
			members.set(comparisonName, {
				name: normalizedName,
				type: isDirectory ? "directory" : "file",
				size: expandedSize,
				dataOffset: dataStart,
				compressedSize,
				method,
				crc,
				mode: unixMode,
			});
			offset += entryLength;
		}
		if (offset !== central.length) {
			throw new Error("Zip central directory contains trailing data.");
		}
		const aggregate = { bytes: 0 };
		for (const member of members.values())
			await validateZipMemberData(archivePath, member, limits, aggregate);
		return { members };
	} finally {
		await handle.close();
	}
}

export async function preflightArchive(
	archivePath: string,
	format: ArchiveFormat,
	limits?: ArchiveLimits,
	allowSymlinks = false,
): Promise<void> {
	if (format === "tar.gz") {
		await preflightTarGz(archivePath, limits, allowSymlinks);
	} else if (format === "tar.zst") {
		const temporaryTar = `${archivePath}.${randomUUID()}.preflight.tar`;
		try {
			await decompressZstdToTar(archivePath, temporaryTar, limits);
			await preflightPlainTar(temporaryTar, limits, allowSymlinks);
		} finally {
			await fsp.rm(temporaryTar, { force: true });
		}
	} else if (format === "zip") {
		if (allowSymlinks)
			throw new Error("Symlink opt-in is supported only for tar archives.");
		await preflightZip(archivePath, limits);
	} else {
		throw new Error(`Unsupported archive format: ${String(format)}.`);
	}
}

async function runExtractor(file: string, args: string[]): Promise<void> {
	const env = { ...process.env };
	for (const variable of [
		"TAR_OPTIONS",
		"TAR_READER_OPTIONS",
		"TAR_WRITER_OPTIONS",
		"UNZIP",
		"UNZIPOPT",
		"BSDTAR",
		"LIBARCHIVE_OPTIONS",
		"LIBARCHIVE_EXTRACT_OPTIONS",
	])
		delete env[variable];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(file, args, {
			shell: false,
			windowsHide: true,
			stdio: ["ignore", "ignore", "pipe"],
			env,
		});
		let stderr = "";
		child.stderr.on("data", (data) => {
			if (stderr.length < 16_384) stderr += data.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Archive extractor failed (${code}): ${stderr}`));
		});
	});
}

async function extractZip(
	archivePath: string,
	directory: string,
	manifest: ZipManifest,
	limitsInput?: ArchiveLimits,
): Promise<void> {
	const aggregate = { bytes: 0 };
	const limits = archiveLimits(limitsInput);
	for (const member of manifest.members.values()) {
		const destination = path.join(directory, ...member.name.split("/"));
		if (member.type === "directory") {
			await fsp.mkdir(destination, { recursive: true, mode: 0o700 });
			continue;
		}
		await fsp.mkdir(path.dirname(destination), {
			recursive: true,
			mode: 0o700,
		});
		try {
			await validateZipMemberData(
				archivePath,
				member,
				limits,
				aggregate,
				destination,
			);
			if ((member.mode & 0o111) !== 0)
				await fsp.chmod(destination, 0o600 | (member.mode & 0o111));
		} catch (error) {
			await fsp.rm(destination, { force: true });
			throw error;
		}
	}
}

async function postflightExtractedDirectory(
	directory: string,
	limitsInput?: ArchiveLimits,
	manifest?: TarManifest,
): Promise<void> {
	const limits = archiveLimits(limitsInput);
	const stack = [directory];
	const rootRealPath = await fsp.realpath(directory);
	const seen = new Set<string>();
	let memberCount = 0;
	let expandedBytes = 0;
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) break;
		for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
			const entryPath = path.join(current, entry.name);
			const stats = await fsp.lstat(entryPath);
			const relativeName = path
				.relative(directory, entryPath)
				.split(path.sep)
				.join("/");
			const comparisonName = relativeName.toLocaleLowerCase("en-US");
			seen.add(comparisonName);
			const declared = manifest?.members.get(comparisonName);
			memberCount += 1;
			if (memberCount > limits.maxMembers)
				throw new Error("Extracted archive has too many members.");
			if (stats.isSymbolicLink()) {
				if (declared?.type !== "symlink") {
					throw new Error(
						`Extracted archive contains an undeclared link: ${relativeName}.`,
					);
				}
				const actualTarget = await fsp.readlink(entryPath);
				if (actualTarget !== declared.linkTarget) {
					throw new Error(
						`Extracted archive link target changed: ${relativeName}.`,
					);
				}
				const targetRealPath = await fsp.realpath(entryPath);
				const relativeRealPath = path.relative(rootRealPath, targetRealPath);
				if (
					relativeRealPath === ".." ||
					relativeRealPath.startsWith(`..${path.sep}`) ||
					path.isAbsolute(relativeRealPath)
				) {
					throw new Error(
						`Extracted archive link escapes its staging directory: ${relativeName}.`,
					);
				}
				continue;
			}
			if (!stats.isDirectory() && !stats.isFile()) {
				throw new Error(
					`Extracted archive contains a link or special entry: ${entry.name}.`,
				);
			}
			if (
				manifest &&
				!declared &&
				(!stats.isDirectory() ||
					![...manifest.members.keys()].some((name) =>
						name.startsWith(`${comparisonName}/`),
					))
			) {
				throw new Error(
					`Extracted archive contains an undeclared member: ${relativeName}.`,
				);
			}
			if (
				declared &&
				declared.type !== (stats.isDirectory() ? "directory" : "file")
			) {
				throw new Error(
					`Extracted archive member type changed: ${relativeName}.`,
				);
			}
			if (stats.isDirectory()) {
				stack.push(entryPath);
			} else {
				if (declared?.size !== undefined && stats.size !== declared.size)
					throw new Error(
						`Extracted archive member size changed: ${relativeName}.`,
					);
				expandedBytes += stats.size;
				if (
					stats.size > limits.maxMemberBytes ||
					expandedBytes > limits.maxExpandedBytes
				) {
					throw new Error("Extracted archive exceeds its size limit.");
				}
			}
		}
	}
	if (manifest) {
		for (const [name, member] of manifest.members) {
			if (!seen.has(name))
				throw new Error(`Extracted archive is missing member: ${member.name}.`);
		}
	}
}

export async function extractVerifiedArchive(
	artifactPath: string,
	artifact: ArtifactMetadata,
	temporaryRoot: string,
): Promise<string> {
	if (!artifact.archive) {
		throw new Error(`Archive metadata is unavailable for ${artifact.id}.`);
	}
	let extractionArchivePath = artifactPath;
	let temporaryTar: string | undefined;
	let manifest: TarManifest | ZipManifest | undefined;
	if (artifact.archive.format === "tar.zst") {
		temporaryTar = `${artifactPath}.${randomUUID()}.verified.tar`;
		await decompressZstdToTar(
			artifactPath,
			temporaryTar,
			artifact.archive.limits,
		);
		extractionArchivePath = temporaryTar;
		try {
			manifest = await preflightPlainTar(
				temporaryTar,
				artifact.archive.limits,
				artifact.archive.allowSymlinks,
			);
		} catch (error) {
			await fsp.rm(temporaryTar, { force: true });
			throw error;
		}
	} else {
		if (artifact.archive.format === "tar.gz") {
			manifest = await preflightTarGz(
				artifactPath,
				artifact.archive.limits,
				artifact.archive.allowSymlinks,
			);
		} else {
			manifest = await preflightZip(artifactPath, artifact.archive.limits);
		}
	}
	const extractionDirectory = await createPrivateStagingDirectory(
		temporaryRoot,
		`${artifact.id.replace(/[^a-zA-Z0-9_.-]/g, "-")}-extract-`,
	);
	try {
		if (artifact.archive.format === "tar.gz") {
			await runExtractor("tar", [
				"-xzf",
				extractionArchivePath,
				"--no-same-owner",
				"--no-same-permissions",
				"-C",
				extractionDirectory,
			]);
		} else if (artifact.archive.format === "tar.zst") {
			await runExtractor("tar", [
				"-xf",
				extractionArchivePath,
				"--no-same-owner",
				"--no-same-permissions",
				"-C",
				extractionDirectory,
			]);
		} else {
			await extractZip(
				artifactPath,
				extractionDirectory,
				manifest as ZipManifest,
				artifact.archive.limits,
			);
		}
		await postflightExtractedDirectory(
			extractionDirectory,
			artifact.archive.limits,
			manifest,
		);
		if (temporaryTar) await fsp.rm(temporaryTar, { force: true });
		return extractionDirectory;
	} catch (error) {
		await fsp.rm(extractionDirectory, { recursive: true, force: true });
		if (temporaryTar) await fsp.rm(temporaryTar, { force: true });
		throw error;
	}
}

export async function promoteStagedDirectory(
	stagedDirectory: string,
	destinationDirectory: string,
): Promise<void> {
	const stagedStats = await fsp.lstat(stagedDirectory);
	if (!stagedStats.isDirectory() || stagedStats.isSymbolicLink())
		throw new Error("Staged source must be a real directory.");
	const backup = path.join(
		path.dirname(destinationDirectory),
		`.${path.basename(destinationDirectory)}.${randomUUID()}.backup`,
	);
	let backedUp = false;
	try {
		try {
			await fsp.rename(destinationDirectory, backup);
			backedUp = true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		try {
			await fsp.rename(stagedDirectory, destinationDirectory);
		} catch (error) {
			if (backedUp) await fsp.rename(backup, destinationDirectory);
			throw error;
		}
		if (backedUp) await fsp.rm(backup, { recursive: true, force: true });
	} catch (error) {
		if (backedUp) {
			const destinationExists = await fsp.lstat(destinationDirectory).then(
				() => true,
				() => false,
			);
			if (!destinationExists)
				await fsp.rename(backup, destinationDirectory).catch(() => {});
		}
		throw error;
	}
}
