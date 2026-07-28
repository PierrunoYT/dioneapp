import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import * as pty from "@lydell/node-pty";
import {
	buildProcessSignalPlan,
	collectWindowsProcessTree,
	parseUnixSessionMembers,
	parseWindowsProcessEntries,
	signalProcessPlan,
} from "../src/main/server/scripts/process-ownership";

const execFileAsync = promisify(execFile);

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitForFile(file: string): Promise<number> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (fs.existsSync(file))
			return Number(await fs.promises.readFile(file, "utf8"));
		await delay(20);
	}
	throw new Error(`Timed out waiting for ${path.basename(file)}`);
}

async function waitForExit(pid: number): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (!isAlive(pid)) return;
		await delay(20);
	}
	throw new Error(`Process ${pid} did not exit`);
}

const unixPlan = buildProcessSignalPlan(41, [41, 42, 43], [41, 44], "linux");
assert.deepEqual(unixPlan, {
	groupTargets: [-41, -44],
	pidTargets: [43, 42],
});
assert.deepEqual(buildProcessSignalPlan(41, [41, 42], [], "win32"), {
	groupTargets: [],
	pidTargets: [42, 41],
});
assert.deepEqual(
	parseUnixSessionMembers(
		" 101 101 7fabc123\n 102 202 7fabc123\n 103 103 other\n",
		"7fabc123",
	),
	[
		{ pid: 101, processGroupId: 101 },
		{ pid: 102, processGroupId: 202 },
	],
);

const calls: Array<[number, NodeJS.Signals]> = [];
signalProcessPlan(unixPlan, "SIGTERM", (pid, signal) =>
	calls.push([pid, signal]),
);
assert.deepEqual(calls, [
	[-41, "SIGTERM"],
	[-44, "SIGTERM"],
	[43, "SIGTERM"],
	[42, "SIGTERM"],
]);

async function main(): Promise<void> {
	if (process.platform === "win32") {
		const directory = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "dione-conpty-tree-"),
		);
		const childPidFile = path.join(directory, "child.pid");
		const environment = Object.fromEntries(
			Object.entries(process.env).filter(
				(entry): entry is [string, string] => entry[1] !== undefined,
			),
		);
		const terminal = pty.spawn(
			process.execPath,
			[
				"-e",
				`const {spawn}=require("node:child_process");const fs=require("node:fs");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});fs.writeFileSync(${JSON.stringify(childPidFile)},String(child.pid));setInterval(()=>{},1000);`,
			],
			{ cwd: directory, env: environment, cols: 80, rows: 24 },
		);
		let childPid: number | undefined;
		try {
			childPid = await waitForFile(childPidFile);
			const script =
				"$ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId | ConvertTo-Json -Compress";
			const { stdout } = await execFileAsync(
				"powershell.exe",
				["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
				{ timeout: 10_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
			);
			assert.ok(
				collectWindowsProcessTree(
					terminal.pid,
					parseWindowsProcessEntries(JSON.parse(stdout)),
				).includes(childPid),
				"CIM fallback discovers a descendant launched through ConPTY",
			);

			await execFileAsync(
				"taskkill.exe",
				["/PID", String(terminal.pid), "/T", "/F"],
				{ timeout: 10_000, windowsHide: true },
			);
			await Promise.all([waitForExit(terminal.pid), waitForExit(childPid)]);
		} finally {
			for (const pid of [childPid, terminal.pid].filter(
				(value): value is number => value !== undefined,
			)) {
				if (!isAlive(pid)) continue;
				try {
					await execFileAsync("taskkill.exe", [
						"/PID",
						String(pid),
						"/T",
						"/F",
					]);
				} catch {
					// Best-effort test cleanup after the assertion failure is reported.
				}
			}
			try {
				terminal.kill();
			} catch {
				// The taskkill verification may already have closed ConPTY.
			}
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	}

	if (process.platform !== "win32") {
		const directory = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "dione-pgroup-"),
		);
		const childPidFile = path.join(directory, "child.pid");
		const leader = spawn(
			process.execPath,
			[
				"-e",
				`const {spawn}=require("node:child_process");const fs=require("node:fs");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});fs.writeFileSync(${JSON.stringify(childPidFile)},String(c.pid));setTimeout(()=>process.exit(0),50);`,
			],
			{ detached: true, stdio: "ignore" },
		);
		assert.ok(leader.pid);
		let childPid: number | undefined;
		try {
			childPid = await waitForFile(childPidFile);
			await waitForExit(leader.pid);
			assert.equal(
				isAlive(-leader.pid),
				true,
				"the owned group remains addressable after its leader exits",
			);
			signalProcessPlan(
				buildProcessSignalPlan(
					leader.pid,
					[leader.pid, childPid],
					[leader.pid],
				),
				"SIGTERM",
			);
			await waitForExit(childPid);
		} finally {
			for (const pid of [childPid, leader.pid].filter(
				(value): value is number => value !== undefined,
			)) {
				if (isAlive(pid)) process.kill(pid, "SIGKILL");
			}
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	}

	if (process.platform === "linux" && fs.existsSync("/usr/bin/setsid")) {
		const directory = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "dione-session-escape-"),
		);
		const escapedPidFile = path.join(directory, "escaped.pid");
		const leader = spawn(
			process.execPath,
			[
				"-e",
				`const {spawn}=require("node:child_process");spawn("/usr/bin/setsid",[process.execPath,"-e",${JSON.stringify(`require("node:fs").writeFileSync(${JSON.stringify(escapedPidFile)},String(process.pid));setInterval(()=>{},1000)`)}],{stdio:"ignore"});setInterval(()=>{},1000);`,
			],
			{ detached: true, stdio: "ignore" },
		);
		assert.ok(leader.pid);
		let escapedPid: number | undefined;
		try {
			escapedPid = await waitForFile(escapedPidFile);
			process.kill(-leader.pid, "SIGKILL");
			await waitForExit(leader.pid);
			assert.equal(
				isAlive(escapedPid),
				true,
				"a process that creates a new session is outside the original group",
			);
		} finally {
			if (escapedPid !== undefined && isAlive(escapedPid)) {
				process.kill(escapedPid, "SIGKILL");
			}
			if (isAlive(leader.pid)) process.kill(leader.pid, "SIGKILL");
			await fs.promises.rm(directory, { recursive: true, force: true });
		}
	}

	console.log("Process ownership checks passed");
}

main().then(
	() => process.exit(0),
	(error) => {
		console.error(error);
		process.exit(1);
	},
);
