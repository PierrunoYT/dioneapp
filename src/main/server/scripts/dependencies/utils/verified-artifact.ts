import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

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

export type ArchiveFormat = "tar.gz" | "zip";

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
	return path.posix.normalize(portablePath.replace(/^\.\//, ""));
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
	let offset = 0;
	while (offset < payload.length) {
		const separator = payload.indexOf(0x20, offset);
		if (separator === -1)
			throw new Error("Archive contains invalid PAX metadata.");
		const length = Number.parseInt(
			payload.toString("ascii", offset, separator),
			10,
		);
		if (
			!Number.isSafeInteger(length) ||
			length <= 0 ||
			offset + length > payload.length
		) {
			throw new Error("Archive contains invalid PAX metadata length.");
		}
		const record = payload.toString("utf8", separator + 1, offset + length - 1);
		const equals = record.indexOf("=");
		if (equals <= 0) throw new Error("Archive contains invalid PAX metadata.");
		attributes[record.slice(0, equals)] = record.slice(equals + 1);
		offset += length;
	}
	return attributes;
}

async function preflightTarGz(
	archivePath: string,
	limitsInput?: ArchiveLimits,
): Promise<void> {
	const limits = archiveLimits(limitsInput);
	const source = fs.createReadStream(archivePath).pipe(createGunzip());
	const reader = new StreamReader(source);
	let memberCount = 0;
	let expandedBytes = 0;
	let pendingLongName: string | undefined;
	let pendingPax: Record<string, string> = {};
	let globalPax: Record<string, string> = {};
	const names = new Set<string>();

	try {
		while (true) {
			const header = await reader.read(512);
			if (!header) break;
			if (header.every((byte) => byte === 0)) break;
			verifyTarHeaderChecksum(header);
			const headerSize = readTarNumber(header.subarray(124, 136), "size");
			const type = String.fromCharCode(header[156] || 0);
			const prefix = readTarString(header.subarray(345, 500));
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
					pendingLongName = readTarString(payload);
				} else if (type === "K") {
					throw new Error("Archive contains a link target entry.");
				} else if (type === "x") {
					pendingPax = parsePaxAttributes(payload);
				} else {
					globalPax = { ...globalPax, ...parsePaxAttributes(payload) };
				}
				await reader.skip((512 - (headerSize % 512)) % 512);
				continue;
			}

			const pax = { ...globalPax, ...pendingPax };
			const memberName = pax.path ?? pendingLongName ?? rawName;
			pendingLongName = undefined;
			pendingPax = {};
			if (
				Object.keys(pax).some((key) => key.toLowerCase().includes("sparse"))
			) {
				throw new Error("Archive contains unsupported sparse tar metadata.");
			}
			if (pax.linkpath) {
				throw new Error("Archive contains a link target.");
			}
			if (pax.size !== undefined && Number(pax.size) !== headerSize) {
				throw new Error("Archive contains inconsistent PAX size metadata.");
			}

			if (!["\0", "0", "5"].includes(type)) {
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

			await reader.skip(headerSize + ((512 - (headerSize % 512)) % 512));
		}
	} finally {
		source.destroy();
	}
}

function decodeZipName(bytes: Buffer, flags: number): string {
	if ((flags & 0x800) === 0 && bytes.some((byte) => byte > 0x7f)) {
		throw new Error("Archive contains a non-UTF-8 legacy zip member name.");
	}
	return bytes.toString((flags & 0x800) !== 0 ? "utf8" : "ascii");
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

async function preflightZip(
	archivePath: string,
	limitsInput?: ArchiveLimits,
): Promise<void> {
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
			if ((flags & 0x1) !== 0)
				throw new Error("Encrypted zip members are not supported.");
			if (![0, 8].includes(method)) {
				throw new Error(
					`Zip archive uses unsupported compression method ${method}.`,
				);
			}

			const nameBytes = central.subarray(offset + 46, offset + 46 + nameLength);
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
			const localHeader = await readFileRange(
				handle,
				30 + nameLength,
				localOffset,
			);
			if (localHeader.readUInt32LE(0) !== 0x04034b50) {
				throw new Error("Zip local member header is malformed.");
			}
			const localFlags = localHeader.readUInt16LE(6);
			const localMethod = localHeader.readUInt16LE(8);
			const localNameLength = localHeader.readUInt16LE(26);
			const localExtraLength = localHeader.readUInt16LE(28);
			if (
				localFlags !== flags ||
				localMethod !== method ||
				localNameLength !== nameLength ||
				!localHeader.subarray(30).equals(nameBytes)
			) {
				throw new Error("Zip local and central member metadata do not match.");
			}
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
			offset += entryLength;
		}
		if (offset !== central.length) {
			throw new Error("Zip central directory contains trailing data.");
		}
	} finally {
		await handle.close();
	}
}

export async function preflightArchive(
	archivePath: string,
	format: ArchiveFormat,
	limits?: ArchiveLimits,
): Promise<void> {
	if (format === "tar.gz") {
		await preflightTarGz(archivePath, limits);
	} else if (format === "zip") {
		await preflightZip(archivePath, limits);
	} else {
		throw new Error(`Unsupported archive format: ${String(format)}.`);
	}
}

async function runExtractor(file: string, args: string[]): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(file, args, {
			shell: false,
			windowsHide: true,
			stdio: ["ignore", "ignore", "pipe"],
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

async function postflightExtractedDirectory(
	directory: string,
	limitsInput?: ArchiveLimits,
): Promise<void> {
	const limits = archiveLimits(limitsInput);
	const stack = [directory];
	let memberCount = 0;
	let expandedBytes = 0;
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) break;
		for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
			const entryPath = path.join(current, entry.name);
			const stats = await fsp.lstat(entryPath);
			memberCount += 1;
			if (memberCount > limits.maxMembers)
				throw new Error("Extracted archive has too many members.");
			if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
				throw new Error(
					`Extracted archive contains a link or special entry: ${entry.name}.`,
				);
			}
			if (stats.isDirectory()) {
				stack.push(entryPath);
			} else {
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
}

export async function extractVerifiedArchive(
	artifactPath: string,
	artifact: ArtifactMetadata,
	temporaryRoot: string,
): Promise<string> {
	if (!artifact.archive) {
		throw new Error(`Archive metadata is unavailable for ${artifact.id}.`);
	}
	await preflightArchive(
		artifactPath,
		artifact.archive.format,
		artifact.archive.limits,
	);
	const extractionDirectory = await createPrivateStagingDirectory(
		temporaryRoot,
		`${artifact.id.replace(/[^a-zA-Z0-9_.-]/g, "-")}-extract-`,
	);
	try {
		if (artifact.archive.format === "tar.gz") {
			await runExtractor("tar", [
				"-xzf",
				artifactPath,
				"-C",
				extractionDirectory,
			]);
		} else if (process.platform === "win32") {
			await runExtractor("tar", [
				"-xf",
				artifactPath,
				"-C",
				extractionDirectory,
			]);
		} else {
			await runExtractor("unzip", [
				"-q",
				artifactPath,
				"-d",
				extractionDirectory,
			]);
		}
		await postflightExtractedDirectory(
			extractionDirectory,
			artifact.archive.limits,
		);
		return extractionDirectory;
	} catch (error) {
		await fsp.rm(extractionDirectory, { recursive: true, force: true });
		throw error;
	}
}

export async function promoteStagedDirectory(
	stagedDirectory: string,
	destinationDirectory: string,
): Promise<void> {
	await fsp.rm(destinationDirectory, { recursive: true, force: true });
	await fsp.rename(stagedDirectory, destinationDirectory);
}
