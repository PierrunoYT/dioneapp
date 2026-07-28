import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
	preflightArchive,
	verifyFileSha256,
} from "../src/main/server/scripts/dependencies/utils/verified-artifact";

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

function tarEntry(name: string, type = "0", content = Buffer.alloc(0)): Buffer {
	const header = Buffer.alloc(512);
	header.write(name, 0, 100, "utf8");
	writeTarOctal(header, 100, 8, type === "5" ? 0o755 : 0o644);
	writeTarOctal(header, 108, 8, 0);
	writeTarOctal(header, 116, 8, 0);
	writeTarOctal(header, 124, 12, content.length);
	writeTarOctal(header, 136, 12, 0);
	header.fill(0x20, 148, 156);
	header.write(type, 156, 1, "ascii");
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

function tarArchive(...entries: Buffer[]): Buffer {
	return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

function zipArchive(name: string, unixMode = 0o100644): Buffer {
	const nameBytes = Buffer.from(name, "utf8");
	const content = Buffer.from("fixture", "utf8");
	const flags = 0x800;
	const local = Buffer.alloc(30 + nameBytes.length);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(flags, 6);
	local.writeUInt16LE(0, 8);
	local.writeUInt32LE(0, 14);
	local.writeUInt32LE(content.length, 18);
	local.writeUInt32LE(content.length, 22);
	local.writeUInt16LE(nameBytes.length, 26);
	nameBytes.copy(local, 30);

	const central = Buffer.alloc(46 + nameBytes.length);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE((3 << 8) | 20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(flags, 8);
	central.writeUInt16LE(0, 10);
	central.writeUInt32LE(0, 16);
	central.writeUInt32LE(content.length, 20);
	central.writeUInt32LE(content.length, 24);
	central.writeUInt16LE(nameBytes.length, 28);
	central.writeUInt32LE((unixMode * 0x10000) >>> 0, 38);
	central.writeUInt32LE(0, 42);
	nameBytes.copy(central, 46);

	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(1, 8);
	eocd.writeUInt16LE(1, 10);
	eocd.writeUInt32LE(central.length, 12);
	eocd.writeUInt32LE(local.length + content.length, 16);
	return Buffer.concat([local, content, central, eocd]);
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

		const traversalTar = path.join(temporaryDirectory, "traversal.tar.gz");
		await fsp.writeFile(traversalTar, tarArchive(tarEntry("../escape")));
		await expectReject(preflightArchive(traversalTar, "tar.gz"), /traversal/);

		const linkTar = path.join(temporaryDirectory, "link.tar.gz");
		await fsp.writeFile(linkTar, tarArchive(tarEntry("link", "2")));
		await expectReject(preflightArchive(linkTar, "tar.gz"), /link or special/);

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
