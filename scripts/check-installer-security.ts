import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { deflateRawSync, gzipSync } from "node:zlib";
import {
	extractVerifiedArchive,
	preflightArchive,
	promoteStagedDirectory,
	verifyFileSha256,
} from "../src/main/server/scripts/dependencies/utils/verified-artifact";

const execFileAsync = promisify(execFile);

function writeTarOctal(
	header: Buffer,
	offset: number,
	length: number,
	value: number,
): void {
	const octal = value.toString(8).padStart(length - 1, "0");
	header.write(octal, offset, length - 1, "ascii");
	header[offset + length - 1] = 0;
}

function tarEntry(
	name: string,
	type = "0",
	content = Buffer.alloc(0),
	linkname = "",
): Buffer {
	const header = Buffer.alloc(512);
	header.write(name, 0, 100, "utf8");
	writeTarOctal(header, 100, 8, type === "5" ? 0o755 : 0o644);
	writeTarOctal(header, 108, 8, 0);
	writeTarOctal(header, 116, 8, 0);
	writeTarOctal(header, 124, 12, content.length);
	writeTarOctal(header, 136, 12, 0);
	header.fill(0x20, 148, 156);
	header.write(type, 156, 1, "ascii");
	header.write(linkname, 157, 100, "utf8");
	header.write("ustar\0", 257, 6, "ascii");
	header.write("00", 263, 2, "ascii");
	let checksum = 0;
	for (const byte of header) checksum += byte;
	const checksumText = checksum.toString(8).padStart(6, "0");
	header.write(checksumText, 148, 6, "ascii");
	header[154] = 0;
	header[155] = 0x20;
	const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
	return Buffer.concat([header, content, padding]);
}

function plainTarArchive(...entries: Buffer[]): Buffer {
	return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

function paxRecord(key: string, value: string): Buffer {
	let length = Buffer.byteLength(` ${key}=${value}\n`) + 1;
	while (
		String(length).length + Buffer.byteLength(` ${key}=${value}\n`) !==
		length
	)
		length = String(length).length + Buffer.byteLength(` ${key}=${value}\n`);
	return Buffer.from(`${length} ${key}=${value}\n`);
}

function updateTarChecksum(entry: Buffer): void {
	entry.fill(0x20, 148, 156);
	let checksum = 0;
	for (const byte of entry.subarray(0, 512)) checksum += byte;
	entry.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
	entry[154] = 0;
	entry[155] = 0x20;
}

function tarArchive(...entries: Buffer[]): Buffer {
	return gzipSync(plainTarArchive(...entries));
}

function crc32(content: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of content) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1)
			crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function zipArchive(
	name: string,
	unixMode = 0o100644,
	extra = Buffer.alloc(0),
	localExpandedSizeDelta = 0,
	deflated = false,
	declaredExpandedSize?: number,
	content = Buffer.from("fixture", "utf8"),
): Buffer {
	const nameBytes = Buffer.from(name, "utf8");
	const compressed = deflated ? deflateRawSync(content) : content;
	const expandedSize = declaredExpandedSize ?? content.length;
	const crc = crc32(content);
	const flags = 0x800;
	const local = Buffer.alloc(30 + nameBytes.length + extra.length);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(flags, 6);
	local.writeUInt16LE(deflated ? 8 : 0, 8);
	local.writeUInt32LE(crc, 14);
	local.writeUInt32LE(compressed.length, 18);
	local.writeUInt32LE(expandedSize + localExpandedSizeDelta, 22);
	local.writeUInt16LE(nameBytes.length, 26);
	local.writeUInt16LE(extra.length, 28);
	nameBytes.copy(local, 30);
	extra.copy(local, 30 + nameBytes.length);

	const central = Buffer.alloc(46 + nameBytes.length + extra.length);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE((3 << 8) | 20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(flags, 8);
	central.writeUInt16LE(deflated ? 8 : 0, 10);
	central.writeUInt32LE(crc, 16);
	central.writeUInt32LE(compressed.length, 20);
	central.writeUInt32LE(expandedSize, 24);
	central.writeUInt16LE(nameBytes.length, 28);
	central.writeUInt16LE(extra.length, 30);
	central.writeUInt32LE((unixMode * 0x10000) >>> 0, 38);
	central.writeUInt32LE(0, 42);
	nameBytes.copy(central, 46);
	extra.copy(central, 46 + nameBytes.length);

	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(1, 8);
	eocd.writeUInt16LE(1, 10);
	eocd.writeUInt32LE(central.length, 12);
	eocd.writeUInt32LE(local.length + compressed.length, 16);
	return Buffer.concat([local, compressed, central, eocd]);
}

async function expectReject(
	operation: Promise<unknown>,
	expectedMessage: RegExp,
): Promise<void> {
	await assert.rejects(operation, expectedMessage);
}

async function main(): Promise<void> {
	const temporaryDirectory = await fsp.mkdtemp(
		path.join(os.tmpdir(), "dione-installer-security-"),
	);
	try {
		const payload = path.join(temporaryDirectory, "payload.bin");
		await fsp.writeFile(payload, "trusted payload");
		await expectReject(
			verifyFileSha256(payload, "0".repeat(64)),
			/SHA-256 mismatch/,
		);

		const safeTar = path.join(temporaryDirectory, "safe.tar.gz");
		await fsp.writeFile(
			safeTar,
			tarArchive(tarEntry("safe/file.txt", "0", Buffer.from("ok"))),
		);
		await preflightArchive(safeTar, "tar.gz");

		const malformedPaxCases: Array<[string, Buffer, RegExp]> = [
			["decimal", Buffer.from("x path=safe\n"), /PAX metadata length/],
			["newline", Buffer.from("13 path=safe!"), /PAX metadata newline/],
		];
		for (const [name, payload, expected] of malformedPaxCases) {
			const fixture = path.join(temporaryDirectory, `pax-${name}.tar.gz`);
			await fsp.writeFile(fixture, tarArchive(tarEntry("pax", "x", payload)));
			await expectReject(preflightArchive(fixture, "tar.gz"), expected);
		}
		const globalPax = path.join(temporaryDirectory, "global-pax.tar.gz");
		await fsp.writeFile(
			globalPax,
			tarArchive(tarEntry("pax", "g", paxRecord("path", "safe"))),
		);
		await expectReject(preflightArchive(globalPax, "tar.gz"), /global PAX/);

		const mixedMetadata = path.join(
			temporaryDirectory,
			"mixed-metadata.tar.gz",
		);
		await fsp.writeFile(
			mixedMetadata,
			tarArchive(
				tarEntry("long", "L", Buffer.from("safe\0")),
				tarEntry("pax", "x", paxRecord("path", "safe")),
				tarEntry("ignored"),
			),
		);
		await expectReject(
			preflightArchive(mixedMetadata, "tar.gz"),
			/mixed or repeated/,
		);

		const confusedEntry = tarEntry("safe");
		confusedEntry.write("../escape", 345, 9, "ascii");
		confusedEntry.write("ustarX", 257, 6, "ascii");
		updateTarChecksum(confusedEntry);
		const confusedPrefix = path.join(
			temporaryDirectory,
			"prefix-confusion.tar.gz",
		);
		await fsp.writeFile(confusedPrefix, tarArchive(confusedEntry));
		await expectReject(preflightArchive(confusedPrefix, "tar.gz"), /signature/);

		for (const [name, size] of [
			["plus", "+1024"],
			["hex", "0x2"],
		]) {
			const fixture = path.join(temporaryDirectory, `pax-size-${name}.tar.gz`);
			await fsp.writeFile(
				fixture,
				tarArchive(
					tarEntry("pax", "x", paxRecord("size", size)),
					tarEntry("safe", "0", Buffer.from("ok")),
				),
			);
			await expectReject(
				preflightArchive(fixture, "tar.gz"),
				/invalid PAX size/,
			);
		}

		const trailingTar = path.join(temporaryDirectory, "trailing.tar.gz");
		await fsp.writeFile(
			trailingTar,
			gzipSync(
				Buffer.concat([
					plainTarArchive(tarEntry("safe")),
					Buffer.alloc(512, 1),
				]),
			),
		);
		await expectReject(
			preflightArchive(trailingTar, "tar.gz"),
			/nonzero trailing data/,
		);
		const paddedGzip = path.join(
			temporaryDirectory,
			"oversized-padding.tar.gz",
		);
		await fsp.writeFile(
			paddedGzip,
			gzipSync(
				Buffer.concat([plainTarArchive(tarEntry("safe")), Buffer.alloc(1024)]),
			),
		);
		await expectReject(
			preflightArchive(paddedGzip, "tar.gz", {
				maxExpandedBytes: 0,
				maxMembers: 1,
			}),
			/decompressed size limit/,
		);

		const traversalTar = path.join(temporaryDirectory, "traversal.tar.gz");
		await fsp.writeFile(traversalTar, tarArchive(tarEntry("../escape")));
		await expectReject(preflightArchive(traversalTar, "tar.gz"), /traversal/);

		const linkTar = path.join(temporaryDirectory, "link.tar.gz");
		await fsp.writeFile(
			linkTar,
			tarArchive(tarEntry("link", "2", Buffer.alloc(0), "target")),
		);
		await expectReject(preflightArchive(linkTar, "tar.gz"), /link or special/);

		const symlinkCases: Array<[string, Buffer, RegExp]> = [
			[
				"absolute",
				tarEntry("link", "2", Buffer.alloc(0), "/etc/passwd"),
				/invalid target/,
			],
			[
				"escape",
				tarEntry("dir/link", "2", Buffer.alloc(0), "../../escape"),
				/escapes/,
			],
			[
				"dangling",
				tarEntry("link", "2", Buffer.alloc(0), "missing"),
				/dangling/,
			],
			[
				"cycle",
				Buffer.concat([
					tarEntry("a", "2", Buffer.alloc(0), "b"),
					tarEntry("b", "2", Buffer.alloc(0), "a"),
				]),
				/cycle/,
			],
			[
				"ancestor",
				Buffer.concat([
					tarEntry("link", "2", Buffer.alloc(0), "target"),
					tarEntry("target", "5"),
					tarEntry("link/file"),
				]),
				/symlink ancestor/,
			],
			[
				"hardlink",
				tarEntry("hard", "1", Buffer.alloc(0), "target"),
				/link or special/,
			],
			["special", tarEntry("device", "3"), /link or special/],
		];
		for (const [fixtureName, entries, expected] of symlinkCases) {
			const fixture = path.join(temporaryDirectory, `${fixtureName}.tar.gz`);
			await fsp.writeFile(fixture, tarArchive(entries));
			await expectReject(
				preflightArchive(fixture, "tar.gz", undefined, true),
				expected,
			);
		}

		const safeLinkTar = path.join(temporaryDirectory, "safe-link.tar.gz");
		await fsp.writeFile(
			safeLinkTar,
			tarArchive(
				tarEntry("safe", "5"),
				tarEntry("safe/file.txt", "0", Buffer.from("ok")),
				tarEntry("safe/link.txt", "2", Buffer.alloc(0), "file.txt"),
			),
		);
		await preflightArchive(safeLinkTar, "tar.gz", undefined, true);
		const previousTarOptions = process.env.TAR_OPTIONS;
		const previousReaderOptions = process.env.TAR_READER_OPTIONS;
		const previousWriterOptions = process.env.TAR_WRITER_OPTIONS;
		process.env.TAR_OPTIONS = "--strip-components=99";
		process.env.TAR_READER_OPTIONS = "--strip-components=99";
		process.env.TAR_WRITER_OPTIONS = "--strip-components=99";
		const extracted = await extractVerifiedArchive(
			safeLinkTar,
			{
				id: "safe-link",
				version: "1",
				url: "https://example.invalid/archive",
				allowedHosts: ["example.invalid"],
				verification: { type: "sha256", sha256: "0".repeat(64) },
				archive: { format: "tar.gz", allowSymlinks: true },
			},
			temporaryDirectory,
		);
		if (previousTarOptions === undefined)
			Reflect.deleteProperty(process.env, "TAR_OPTIONS");
		else process.env.TAR_OPTIONS = previousTarOptions;
		if (previousReaderOptions === undefined)
			Reflect.deleteProperty(process.env, "TAR_READER_OPTIONS");
		else process.env.TAR_READER_OPTIONS = previousReaderOptions;
		if (previousWriterOptions === undefined)
			Reflect.deleteProperty(process.env, "TAR_WRITER_OPTIONS");
		else process.env.TAR_WRITER_OPTIONS = previousWriterOptions;
		assert.equal(
			await fsp.readlink(path.join(extracted, "safe/link.txt")),
			"file.txt",
		);
		await fsp.rm(extracted, { recursive: true, force: true });

		const plainTar = path.join(temporaryDirectory, "safe.tar");
		const zstdTar = path.join(temporaryDirectory, "safe.tar.zst");
		await fsp.writeFile(
			plainTar,
			plainTarArchive(tarEntry("file", "0", Buffer.from("zstd"))),
		);
		await execFileAsync("zstd", ["-q", "-f", plainTar, "-o", zstdTar]);
		await preflightArchive(zstdTar, "tar.zst");
		await expectReject(
			preflightArchive(zstdTar, "tar.zst", {
				maxExpandedBytes: 1,
				maxMembers: 1,
			}),
			/(decompressed size|expanded size|oversized)/i,
		);
		const corruptZstd = path.join(temporaryDirectory, "corrupt.tar.zst");
		await fsp.writeFile(corruptZstd, Buffer.from("not zstandard"));
		await expectReject(
			preflightArchive(corruptZstd, "tar.zst"),
			/Zstandard archive/,
		);

		const excessiveTar = path.join(temporaryDirectory, "excessive.tar.gz");
		await fsp.writeFile(
			excessiveTar,
			tarArchive(tarEntry("one"), tarEntry("two")),
		);
		await expectReject(
			preflightArchive(excessiveTar, "tar.gz", { maxMembers: 1 }),
			/too many members/,
		);

		const traversalZip = path.join(temporaryDirectory, "traversal.zip");
		await fsp.writeFile(traversalZip, zipArchive("../escape.exe"));
		await expectReject(preflightArchive(traversalZip, "zip"), /traversal/);

		const linkZip = path.join(temporaryDirectory, "link.zip");
		await fsp.writeFile(linkZip, zipArchive("link", 0o120777));
		await expectReject(preflightArchive(linkZip, "zip"), /link or special/);

		const mismatchedZip = path.join(temporaryDirectory, "mismatched.zip");
		await fsp.writeFile(
			mismatchedZip,
			zipArchive("safe", 0o100644, Buffer.alloc(0), 1),
		);
		await expectReject(
			preflightArchive(mismatchedZip, "zip"),
			/metadata do not match/,
		);
		const unicodePathExtra = Buffer.from([0x75, 0x70, 0x01, 0x00, 0x01]);
		const unicodePathZip = path.join(temporaryDirectory, "unicode-path.zip");
		await fsp.writeFile(
			unicodePathZip,
			zipArchive("safe", 0o100644, unicodePathExtra),
		);
		await expectReject(
			preflightArchive(unicodePathZip, "zip"),
			/Unicode path extra/,
		);
		const forgedDeflate = path.join(temporaryDirectory, "forged-deflate.zip");
		await fsp.writeFile(
			forgedDeflate,
			zipArchive("safe", 0o100644, Buffer.alloc(0), 0, true, 1),
		);
		await expectReject(
			preflightArchive(forgedDeflate, "zip"),
			/actual size limit/,
		);
		const largeDeflate = path.join(temporaryDirectory, "large-deflate.zip");
		await fsp.writeFile(
			largeDeflate,
			zipArchive(
				"large",
				0o100644,
				Buffer.alloc(0),
				0,
				true,
				undefined,
				Buffer.alloc(128 * 1024, 0x61),
			),
		);
		await preflightArchive(largeDeflate, "zip");

		const safeDeflate = path.join(temporaryDirectory, "safe-deflate.zip");
		await fsp.writeFile(
			safeDeflate,
			zipArchive("bin/tool", 0o100755, Buffer.alloc(0), 0, true),
		);
		const extractedZip = await extractVerifiedArchive(
			safeDeflate,
			{
				id: "safe-deflate",
				version: "1",
				url: "https://example.invalid/archive",
				allowedHosts: ["example.invalid"],
				verification: { type: "sha256", sha256: "0".repeat(64) },
				archive: { format: "zip" },
			},
			temporaryDirectory,
		);
		assert.equal(
			await fsp.readFile(path.join(extractedZip, "bin/tool"), "utf8"),
			"fixture",
		);
		assert.notEqual(
			(await fsp.stat(path.join(extractedZip, "bin/tool"))).mode & 0o111,
			0,
		);
		await fsp.rm(extractedZip, { recursive: true, force: true });

		const realStaged = path.join(temporaryDirectory, "real-staged");
		const linkedStaged = path.join(temporaryDirectory, "linked-staged");
		await fsp.mkdir(realStaged);
		await fsp.symlink(realStaged, linkedStaged, "dir");
		await expectReject(
			promoteStagedDirectory(
				linkedStaged,
				path.join(temporaryDirectory, "destination"),
			),
			/real directory/,
		);
	} finally {
		await fsp.rm(temporaryDirectory, { recursive: true, force: true });
	}
	console.log(
		"Installer integrity and malicious archive fixture checks passed.",
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
