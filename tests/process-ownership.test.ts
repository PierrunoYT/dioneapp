import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
	buildProcessSignalPlan,
	signalProcessPlan,
} from "../src/main/server/scripts/process-ownership";

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		if (pid > 0 && process.platform === "linux") {
			const state = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[2];
			if (state === "Z") return false;
		}
		return true;
	} catch {
		return false;
	}
};

async function boundedExit(child: ReturnType<typeof spawn>, timeout = 2_000) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve, reject) => {
		const onExit = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			child.removeListener("exit", onExit);
			reject(
				new Error(`process ${child.pid} did not exit within ${timeout}ms`),
			);
		}, timeout);
		child.once("exit", onExit);
	});
}

async function descendantPid(child: ReturnType<typeof spawn>): Promise<number> {
	assert.ok(child.stdout);
	return new Promise<number>((resolve, reject) => {
		let output = "";
		const onData = (chunk: Buffer) => {
			output += chunk.toString();
			const match = output.match(/^(\d+)\n/);
			if (!match) return;
			clearTimeout(timer);
			child.stdout?.removeListener("data", onData);
			resolve(Number(match[1]));
		};
		const timer = setTimeout(() => {
			child.stdout?.removeListener("data", onData);
			reject(new Error("Timed out waiting for descendant PID"));
		}, 2_000);
		child.stdout.on("data", onData);
	});
}

test(
	"production signal plan terminates a real detached Linux process group and descendant",
	{ skip: process.platform !== "linux", timeout: 8_000 },
	async () => {
		const leader = spawn(
			process.execPath,
			[
				"-e",
				"const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.stdout.write(String(child.pid)+'\\n');setInterval(()=>{},1000)",
			],
			{ detached: true, stdio: ["ignore", "pipe", "ignore"] },
		);
		assert.ok(leader.pid);
		let childPid: number | undefined;
		try {
			childPid = await descendantPid(leader);
			assert.equal(alive(childPid), true, "descendant was not running");
			assert.equal(alive(-leader.pid), true);
			signalProcessPlan(
				buildProcessSignalPlan(leader.pid, [leader.pid], [leader.pid], "linux"),
				"SIGTERM",
			);
			await boundedExit(leader);
			for (
				let attempt = 0;
				attempt < 100 && (alive(childPid) || alive(-leader.pid));
				attempt++
			)
				await delay(20);
			assert.equal(alive(childPid), false, "descendant remained alive");
			assert.equal(
				alive(-leader.pid),
				false,
				"descendant kept process group alive",
			);
		} finally {
			if (alive(-leader.pid)) process.kill(-leader.pid, "SIGKILL");
			if (childPid !== undefined && alive(childPid))
				process.kill(childPid, "SIGKILL");
			if (alive(leader.pid)) process.kill(leader.pid, "SIGKILL");
		}
	},
);
