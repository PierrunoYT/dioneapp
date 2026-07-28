import { type ChildProcess, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { arch, platform as getPlatform } from "node:os";
import path from "node:path";
import {
	getAllValues,
	initDefaultEnv,
} from "@/server/scripts/dependencies/environment";
import BuildToolsManager from "@/server/scripts/dependencies/utils/build-tools-manager";
import { getSystemInfo } from "@/server/scripts/system";
import logger from "@/server/utils/logger";
import pty, { type IPty } from "@lydell/node-pty";
import pidtree from "pidtree";
import type { Server } from "socket.io";
import { useGit } from "../utils/use-git";
import {
	appendBoundedOutput,
	createCommandDeadline,
	resolveContainedWorkingDirectory,
} from "./process-helpers";
import {
	type UnixSessionMember,
	buildProcessSignalPlan,
	parseUnixSessionMembers,
	signalProcessPlan,
} from "./process-ownership";

export {
	appendBoundedOutput,
	createCommandDeadline,
	resolveContainedWorkingDirectory,
} from "./process-helpers";

const DEFAULT_COMMAND_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const PROCESS_GRACE_MS = 3_000;
const PROCESS_ESCALATION_MS = 2_000;
const MAX_PENDING_SOCKET_BYTES = 64 * 1024;
const MAX_SOCKET_BATCH_BYTES = 16 * 1024;
const SOCKET_FLUSH_INTERVAL_MS = 100;

export interface ProcessCommand {
	command?: string;
	file?: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	displayCommand?: string;
	platform?: string;
	gpus?: string | string[];
}

interface OperationState {
	appId: string;
	id: string;
	controller: AbortController;
	removeParentAbort?: () => void;
}

interface ManagedProcess {
	appId: string;
	operationId: string;
	pid: number;
	pty?: IPty;
	child?: ChildProcess;
	exited: Promise<void>;
	rootExited: boolean;
	knownPids: Set<number>;
	processGroupIds: Set<number>;
	sessionToken?: string;
	ownershipReleaseTimer?: ReturnType<typeof setTimeout>;
	terminating?: Promise<void>;
}

export const log = (io: Server, id: string, content: string, type?: string) => {
	io.to(id).emit(type || "installUpdate", {
		type: "log",
		content: `${content}\r\n`,
	});
};

const activeProcesses = new Map<number, ManagedProcess>();
const processesByApp = new Map<string, Set<number>>();
const processesDimensions = new Map<string, { cols: number; rows: number }>();
const operationsByApp = new Map<string, Map<string, OperationState>>();

export const cleanTerminalByID = (id: string): void => {
	const pids = processesByApp.get(id);
	if (!pids) return;

	for (const pid of pids) {
		const proc = activeProcesses.get(pid)?.pty;
		if (!proc) continue;
		try {
			proc.write("\u001bc");
		} catch (error) {
			logger.warn(`Failed to clear process ${pid}: ${error}`);
		}
	}
};

export const resizeTerminal = (id: string, cols: number, rows: number) => {
	processesDimensions.set(id, { cols, rows });
	const pids = getTrackedPIDs(id);
	for (const pid of pids) {
		const proc = activeProcesses.get(pid)?.pty;
		if (!proc) continue;
		try {
			proc.resize(cols, rows);
		} catch (error) {
			logger.warn(`Failed to resize process ${pid}: ${error}`);
		}
	}
};

const trackProcess = (process: ManagedProcess) => {
	activeProcesses.set(process.pid, process);
	const { appId, pid } = process;
	const set = processesByApp.get(appId) ?? new Set<number>();
	set.add(pid);
	processesByApp.set(appId, set);

	const dims = processesDimensions.get(appId);
	if (dims && process.pty) {
		try {
			process.pty.resize(dims.cols, dims.rows);
		} catch (error) {
			logger.warn(`Failed to resize process ${pid} on register: ${error}`);
		}
	}
};

const sanitizePathForLog = (p?: string) => {
	if (!p) return "";
	try {
		return path.basename(p) || p;
	} catch (e) {
		return p;
	}
};

const unregisterProcess = (managed: ManagedProcess) => {
	if (activeProcesses.get(managed.pid) !== managed) return;
	if (managed.ownershipReleaseTimer) {
		clearTimeout(managed.ownershipReleaseTimer);
	}
	activeProcesses.delete(managed.pid);
	if (!managed.appId || !processesByApp.has(managed.appId)) return;
	const set = processesByApp.get(managed.appId);
	set?.delete(managed.pid);
	if (set && set.size === 0) {
		processesByApp.delete(managed.appId);
	}
};

const getTrackedPIDs = (appId?: string): number[] => {
	if (appId && processesByApp.has(appId)) {
		return Array.from(processesByApp.get(appId) ?? []);
	}
	return Array.from(activeProcesses.keys());
};

function beginOperation(
	appId: string,
	parentSignal?: AbortSignal,
): OperationState {
	const state: OperationState = {
		appId,
		id: randomUUID(),
		controller: new AbortController(),
	};
	if (parentSignal) {
		const abort = () => state.controller.abort(parentSignal.reason);
		if (parentSignal.aborted) abort();
		else {
			parentSignal.addEventListener("abort", abort, { once: true });
			state.removeParentAbort = () =>
				parentSignal.removeEventListener("abort", abort);
		}
	}
	const operations = operationsByApp.get(appId) ?? new Map();
	operations.set(state.id, state);
	operationsByApp.set(appId, operations);
	return state;
}

function finishOperation(state: OperationState): void {
	state.removeParentAbort?.();
	const operations = operationsByApp.get(state.appId);
	if (operations?.get(state.id) !== state) return;
	operations.delete(state.id);
	if (operations.size === 0) operationsByApp.delete(state.appId);
}

function abortAppOperations(appId?: string): void {
	const groups = appId
		? [operationsByApp.get(appId)]
		: Array.from(operationsByApp.values());
	for (const operations of groups) {
		for (const operation of operations?.values() ?? []) {
			operation.controller.abort(new Error("Operation cancelled"));
		}
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function hasLiveProcessGroup(processGroupIds: Iterable<number>): boolean {
	if (process.platform === "win32") return false;
	return Array.from(processGroupIds).some((groupId) =>
		isProcessAlive(-groupId),
	);
}

async function getUnixSessionToken(pid: number): Promise<string | undefined> {
	if (process.platform === "win32") return undefined;
	// Linux reports the numeric session-leader PID as `sess`; detached children
	// and node-pty leaders are known to create a new session.
	if (process.platform === "linux") return String(pid);
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			execFile(
				"ps",
				["-o", "sess=", "-p", String(pid)],
				{ timeout: 3_000, maxBuffer: 64 * 1024 },
				(error, output) => (error ? reject(error) : resolve(output)),
			);
		});
		return stdout.trim().split(/\s+/)[0] || undefined;
	} catch (error) {
		logger.warn(`Failed to capture Unix session for ${pid}: ${error}`);
		return undefined;
	}
}

async function getUnixSessionMembers(
	sessionToken?: string,
): Promise<UnixSessionMember[] | undefined> {
	if (process.platform === "win32") return [];
	if (sessionToken === undefined) return undefined;
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			execFile(
				"ps",
				["-axo", "pid=,pgid=,sess="],
				{ timeout: 3_000, maxBuffer: 8 * 1024 * 1024 },
				(error, output) => (error ? reject(error) : resolve(output)),
			);
		});
		return parseUnixSessionMembers(stdout, sessionToken);
	} catch (error) {
		logger.warn(`Failed to enumerate Unix session ${sessionToken}: ${error}`);
		return undefined;
	}
}

async function refreshUnixSession(
	managed: ManagedProcess,
): Promise<boolean | undefined> {
	const members = await getUnixSessionMembers(managed.sessionToken);
	if (members === undefined) return undefined;
	managed.knownPids = new Set(members.map((member) => member.pid));
	managed.processGroupIds = new Set(
		members.map((member) => member.processGroupId),
	);
	return members.length > 0;
}

async function releaseOwnershipWhenSessionExits(
	managed: ManagedProcess,
): Promise<void> {
	if (managed.terminating || activeProcesses.get(managed.pid) !== managed) {
		return;
	}
	const members = await getUnixSessionMembers(managed.sessionToken);
	if (members === undefined) {
		if (
			managed.sessionToken === undefined &&
			!hasLiveProcessGroup(managed.processGroupIds)
		) {
			unregisterProcess(managed);
			return;
		}
		managed.ownershipReleaseTimer = setTimeout(
			() => void releaseOwnershipWhenSessionExits(managed),
			1_000,
		);
		managed.ownershipReleaseTimer.unref();
		return;
	}
	managed.knownPids = new Set(members.map((member) => member.pid));
	managed.processGroupIds = new Set(
		members.map((member) => member.processGroupId),
	);
	const sessionAlive = members.length > 0;
	if (!sessionAlive && !hasLiveProcessGroup(managed.processGroupIds)) {
		unregisterProcess(managed);
		return;
	}
	managed.ownershipReleaseTimer = setTimeout(
		() => void releaseOwnershipWhenSessionExits(managed),
		1_000,
	);
	managed.ownershipReleaseTimer.unref();
}

async function getOwnedProcessTree(pid: number): Promise<number[]> {
	try {
		const pids = await pidtree(pid, { root: true });
		return Array.from(new Set(pids.filter(Number.isSafeInteger)));
	} catch {
		if (process.platform === "win32") {
			try {
				const script =
					"$ErrorActionPreference = 'Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId | ConvertTo-Json -Compress";
				const stdout = await new Promise<string>((resolve, reject) => {
					execFile(
						"powershell.exe",
						["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
						{ timeout: 3_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
						(error, output) => {
							if (error) reject(error);
							else resolve(output);
						},
					);
				});
				const parsed = JSON.parse(stdout) as
					| Record<string, unknown>
					| Array<Record<string, unknown>>;
				const children = new Map<number, number[]>();
				for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
					const processId = Number(entry.ProcessId);
					const parentId = Number(entry.ParentProcessId);
					if (
						!Number.isSafeInteger(processId) ||
						!Number.isSafeInteger(parentId)
					) {
						continue;
					}
					const siblings = children.get(parentId) ?? [];
					siblings.push(processId);
					children.set(parentId, siblings);
				}
				const result = [pid];
				const seen = new Set(result);
				for (let index = 0; index < result.length; index++) {
					for (const child of children.get(result[index]) ?? []) {
						if (seen.has(child)) continue;
						seen.add(child);
						result.push(child);
					}
				}
				return result;
			} catch (error) {
				logger.warn(
					`Failed to enumerate Windows process tree ${pid}: ${error}`,
				);
			}
		}
		return isProcessAlive(pid) ? [pid] : [];
	}
}

function signalProcessTree(
	pids: number[],
	rootPid: number,
	signal: NodeJS.Signals,
	processGroupIds: Iterable<number>,
) {
	signalProcessPlan(
		buildProcessSignalPlan(rootPid, pids, processGroupIds),
		signal,
		process.kill,
		(target, error) =>
			logger.warn(`Failed to signal owned process target ${target}: ${error}`),
	);
}

async function forceTerminateWindowsTree(
	managed: ManagedProcess,
): Promise<void> {
	if (managed.pty) {
		try {
			// node-pty enumerates attached console processes before closing ConPTY.
			managed.pty.kill();
		} catch (error) {
			logger.warn(`Failed to close ConPTY ${managed.pid}: ${error}`);
		}
	}
	if (managed.rootExited) return;
	await new Promise<void>((resolve) => {
		execFile(
			"taskkill.exe",
			["/PID", String(managed.pid), "/T", "/F"],
			{ timeout: PROCESS_ESCALATION_MS, windowsHide: true },
			(error) => {
				if (error && isProcessAlive(managed.pid)) {
					logger.warn(
						`Failed to terminate Windows process tree ${managed.pid}: ${error}`,
					);
				}
				resolve();
			},
		);
	});
}

async function waitForProcessTreeExit(
	pids: number[],
	timeoutMs: number,
	processGroupIds: Iterable<number>,
): Promise<{ survivors: number[]; groupAlive: boolean }> {
	const deadline = Date.now() + timeoutMs;
	let survivors = pids.filter(isProcessAlive);
	let groupAlive = hasLiveProcessGroup(processGroupIds);
	while ((survivors.length > 0 || groupAlive) && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 50));
		survivors = survivors.filter(isProcessAlive);
		groupAlive = hasLiveProcessGroup(processGroupIds);
	}
	return { survivors, groupAlive };
}

async function terminateManagedProcess(managed: ManagedProcess): Promise<void> {
	if (managed.terminating) return managed.terminating;
	const termination = (async () => {
		let sessionEnumerationFailed =
			managed.sessionToken !== undefined &&
			(await refreshUnixSession(managed)) === undefined;
		const refreshedPids = managed.rootExited
			? []
			: await getOwnedProcessTree(managed.pid);
		const ownedPids = Array.from(
			new Set([...managed.knownPids, ...refreshedPids]),
		).filter(
			(pid) =>
				(!managed.rootExited || pid !== managed.pid) && isProcessAlive(pid),
		);
		managed.knownPids = new Set(ownedPids);
		if (managed.pty) {
			try {
				managed.pty.write("\x03");
			} catch (error) {
				logger.warn(`Failed to interrupt process ${managed.pid}: ${error}`);
			}
		}
		if (
			(ownedPids.length > 0 || hasLiveProcessGroup(managed.processGroupIds)) &&
			(process.platform !== "win32" || !managed.pty)
		) {
			signalProcessTree(
				ownedPids,
				managed.pid,
				"SIGTERM",
				managed.processGroupIds,
			);
		}
		let { survivors, groupAlive } = await waitForProcessTreeExit(
			ownedPids,
			PROCESS_GRACE_MS,
			managed.processGroupIds,
		);
		const sessionAliveAfterGrace = await refreshUnixSession(managed);
		sessionEnumerationFailed ||=
			managed.sessionToken !== undefined &&
			sessionAliveAfterGrace === undefined;
		const refreshed = managed.rootExited
			? []
			: await getOwnedProcessTree(managed.pid);
		survivors = Array.from(
			new Set([...survivors, ...managed.knownPids, ...refreshed]),
		).filter(
			(pid) =>
				(!managed.rootExited || pid !== managed.pid) && isProcessAlive(pid),
		);
		groupAlive = hasLiveProcessGroup(managed.processGroupIds);
		if (survivors.length > 0 || groupAlive || sessionAliveAfterGrace === true) {
			managed.knownPids = new Set(survivors);
			if (process.platform === "win32") {
				await forceTerminateWindowsTree(managed);
			}
			signalProcessTree(
				survivors,
				managed.pid,
				"SIGKILL",
				managed.processGroupIds,
			);
			({ survivors, groupAlive } = await waitForProcessTreeExit(
				survivors,
				PROCESS_ESCALATION_MS,
				managed.processGroupIds,
			));
		}
		const finalSessionAlive = await refreshUnixSession(managed);
		sessionEnumerationFailed ||=
			managed.sessionToken !== undefined && finalSessionAlive === undefined;
		const finalSessionPids = Array.from(managed.knownPids).filter(
			isProcessAlive,
		);
		if (finalSessionPids.length > 0 || finalSessionAlive === true) {
			signalProcessTree(
				finalSessionPids,
				managed.pid,
				"SIGKILL",
				managed.processGroupIds,
			);
			({ survivors, groupAlive } = await waitForProcessTreeExit(
				finalSessionPids,
				PROCESS_ESCALATION_MS,
				managed.processGroupIds,
			));
			const remainingSession = await refreshUnixSession(managed);
			sessionEnumerationFailed ||=
				managed.sessionToken !== undefined && remainingSession === undefined;
			if (remainingSession === true) groupAlive = true;
		}
		if (survivors.length > 0 || groupAlive || sessionEnumerationFailed) {
			managed.knownPids = new Set(survivors);
			throw new Error(
				`Owned process containment did not stop: ${[
					...survivors,
					...(groupAlive ? ["owned Unix session"] : []),
					...(sessionEnumerationFailed
						? ["Unix session could not be verified"]
						: []),
				].join(", ")}`,
			);
		}
		unregisterProcess(managed);
		logger.info(`Stopped owned process tree rooted at ${managed.pid}`);
	})();
	managed.terminating = termination;
	try {
		await termination;
	} catch (error) {
		if (managed.terminating === termination) managed.terminating = undefined;
		throw error;
	}
}

const dropProcesses = async (
	id?: string,
	pid?: number,
	operationId?: string,
) => {
	const managed = Array.from(activeProcesses.values()).filter(
		(process) =>
			(!id || process.appId === id) &&
			(!pid || process.pid === pid) &&
			(!operationId || process.operationId === operationId),
	);
	if (pid && managed.length === 0) {
		throw new Error(`Process ${pid} is not owned by app ${id ?? "unknown"}`);
	}
	await Promise.all(managed.map(terminateManagedProcess));
};

export async function registerOwnedChildProcess(
	appId: string,
	child: ChildProcess,
	options?: { processGroupId?: number },
): Promise<void> {
	if (!child.pid)
		throw new Error("Cannot register a child process without a PID");
	let resolveExit: () => void = () => {};
	const exited = new Promise<void>((resolve) => {
		resolveExit = resolve;
	});
	const managedRef: { current?: ManagedProcess } = {};
	let rootExited = false;
	child.once("exit", () => {
		rootExited = true;
		resolveExit();
		if (managedRef.current && !managedRef.current.terminating) {
			managedRef.current.rootExited = true;
			void releaseOwnershipWhenSessionExits(managedRef.current);
		}
	});
	const sessionToken = await getUnixSessionToken(child.pid);
	const managed: ManagedProcess = {
		appId,
		operationId: `${appId}:service`,
		pid: child.pid,
		child,
		exited,
		rootExited,
		knownPids: new Set([child.pid]),
		processGroupIds: new Set(
			options?.processGroupId === undefined ? [] : [options.processGroupId],
		),
		sessionToken,
	};
	managedRef.current = managed;
	trackProcess(managed);
	if (rootExited) void releaseOwnershipWhenSessionExits(managed);
}

export const stopActiveProcess = async (
	io: Server,
	id: string,
	pid?: number,
) => {
	abortAppOperations(id);

	if (pid) {
		log(io, id, `Killing process with id ${pid}`);
		logger.info(`Killing process with id ${pid}`);
	} else {
		log(io, id, `Killing all processes for app ${id}`);
		logger.info(`Killing all processes for app ${id}`);
	}

	await dropProcesses(id, pid);
	return true;
};

export const stopAllActiveProcesses = async (): Promise<void> => {
	abortAppOperations();
	await dropProcesses();
};

function splitOutputBatch(value: string, maxBytes: number): [string, string] {
	let bytes = 0;
	let end = 0;
	for (const character of value) {
		const characterBytes = Buffer.byteLength(character);
		if (bytes + characterBytes > maxBytes) break;
		bytes += characterBytes;
		end += character.length;
	}
	return [value.slice(0, end), value.slice(end)];
}

class RateLimitedSocketOutput {
	private pending = "";
	private timer?: ReturnType<typeof setTimeout>;
	private dropped = false;

	constructor(
		private readonly emit: (content: string) => void,
		private readonly maxPendingBytes = MAX_PENDING_SOCKET_BYTES,
	) {}

	write(content: string): void {
		if (
			Buffer.byteLength(this.pending) + Buffer.byteLength(content) >
			this.maxPendingBytes
		) {
			this.dropped = true;
		}
		this.pending = appendBoundedOutput(
			this.pending,
			content,
			this.maxPendingBytes,
		);
		this.schedule();
	}

	close(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		while (this.pending) this.flush(false);
		if (this.dropped) {
			this.emit("\r\n[Output truncated by Dione]\r\n");
		}
		this.dropped = false;
	}

	private schedule(): void {
		if (this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.flush(true);
		}, SOCKET_FLUSH_INTERVAL_MS);
	}

	private flush(reschedule: boolean): void {
		const [batch, remainder] = splitOutputBatch(
			this.pending,
			MAX_SOCKET_BATCH_BYTES,
		);
		this.pending = remainder;
		if (batch) this.emit(batch);
		if (reschedule && this.pending) this.schedule();
	}
}

interface ExecuteCommandOptions {
	customEnv?: Record<string, string>;
	onOutput?: (text: string) => void;
	signal?: AbortSignal;
	operationId?: string;
	timeoutMs?: number;
}

function filterOutput(data: string, isWindows: boolean): string {
	let text = data.replace(/\x1b\][^\x07]*\x07/g, "");
	if (isWindows) {
		text = text.replace(/Microsoft Windows \[[^\r\n]*\](\r?\n)?/gi, "");
		text = text.replace(/\(c\)\s*Microsoft Corporation[^\r\n]*\r?\n?/gi, "");
		text = text.replace(/[A-Z]:\\[^\r\n>]*>@echo off\r?\n?/gi, "");
		text = text.replace(/@echo off\r?\n?/gi, "");
		text = text.replace(/exit %ERRORLEVEL%\r?\n?/gi, "");
	}
	return text.replace(/R\r?\n/g, "\r\n");
}

function cleanANSI(data: string): string {
	const pattern = [
		"[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
		"(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-Za-z=><~]))",
	].join("|");
	return data.replaceAll(new RegExp(pattern, "gi"), "");
}

export const executeCommand = async (
	command: string | ProcessCommand,
	io: Server,
	workingDir: string,
	id: string,
	needsBuildTools?: boolean,
	logsType?: string,
	options?: ExecuteCommandOptions,
): Promise<{ code: number; stdout: string; stderr: string }> => {
	const localOperation = options?.operationId
		? undefined
		: beginOperation(id, options?.signal);
	const operationId =
		options?.operationId ?? localOperation?.id ?? randomUUID();
	const operationSignal = localOperation?.controller.signal ?? options?.signal;
	const timeoutMs = options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
		throw new Error("Command timeout must be a positive integer");
	}
	const deadline = createCommandDeadline(operationSignal, timeoutMs);
	let outputData = "";
	const logs = logsType || "installUpdate";

	try {
		const enhancedEnv = options?.customEnv
			? options.customEnv
			: await getEnhancedEnv(needsBuildTools || false);
		const currentPlatform = getPlatform();
		const isWindows = currentPlatform === "win32";
		const commandSpec: ProcessCommand =
			typeof command === "string" ? { command } : command;
		const shellCommand = commandSpec.command?.trim();
		if (!shellCommand && !commandSpec.file) {
			throw new Error("Command must provide shell text or an executable");
		}
		if (commandSpec.file && !Array.isArray(commandSpec.args)) {
			throw new Error("Structured command arguments must be an array");
		}
		const displayCommand =
			commandSpec.displayCommand ||
			shellCommand ||
			[commandSpec.file, ...(commandSpec.args ?? [])].join(" ");
		io.to(id).emit("installUpdate", {
			type: "currentCommand",
			content: displayCommand,
		});
		const dims = processesDimensions.get(id) ?? { cols: 120, rows: 40 };
		const canonicalWorkingDir = await fs.promises.realpath(workingDir);

		logger.info(
			`Working on directory: ${sanitizePathForLog(canonicalWorkingDir)}`,
		);
		logger.info(
			`Executing: ${displayCommand.length > 300 ? `${displayCommand.substring(0, 300)}...` : displayCommand}`,
		);
		if (deadline.signal.aborted) {
			return {
				code: deadline.timedOut ? 124 : 130,
				stdout: "",
				stderr: deadline.timedOut ? "Command timed out" : "Command cancelled",
			};
		}

		// handle git commands on non-Windows
		if (!commandSpec.file && !isWindows && shellCommand?.startsWith("git ")) {
			const result = await useGit(
				shellCommand,
				canonicalWorkingDir,
				io,
				id,
				deadline.signal,
			);
			if (result) {
				return { code: 0, stdout: "", stderr: "" };
			}
		}

		const shell = isWindows
			? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe"
			: process.env.SHELL || "/bin/bash";
		const executable = commandSpec.file || shell;
		const executableArgs = commandSpec.file
			? (commandSpec.args ?? [])
			: isWindows
				? ["/Q"]
				: [];
		const commandEnvironment = {
			...enhancedEnv,
			...commandSpec.env,
		} as Record<string, string>;
		if (commandSpec.env?.PATH) {
			commandEnvironment.PATH = [commandSpec.env.PATH, enhancedEnv.PATH]
				.filter(Boolean)
				.join(path.delimiter);
		}
		const ptyProcess = pty.spawn(executable, executableArgs, {
			name: "xterm-256color",
			cols: dims.cols,
			rows: dims.rows,
			cwd: canonicalWorkingDir,
			env: commandEnvironment,
		});
		const pid = ptyProcess.pid;
		let resolveExit: (value: { exitCode: number }) => void = () => {};
		const exitResult = new Promise<{ exitCode: number }>((resolve) => {
			resolveExit = resolve;
		});
		const socketOutput = new RateLimitedSocketOutput((content) => {
			io.to(id).emit(logs, { type: "log", content });
		});
		const dataDisposable = ptyProcess.onData((data: string) => {
			const clean = cleanANSI(filterOutput(data, isWindows));
			if (!clean) return;
			outputData = appendBoundedOutput(outputData, clean);
			options?.onOutput?.(clean);
			socketOutput.write(clean);
		});
		const managedRef: { current?: ManagedProcess } = {};
		let rootExited = false;
		const exitDisposable = ptyProcess.onExit(({ exitCode }) => {
			rootExited = true;
			resolveExit({ exitCode: exitCode ?? 0 });
			if (managedRef.current && !managedRef.current.terminating) {
				managedRef.current.rootExited = true;
				void releaseOwnershipWhenSessionExits(managedRef.current);
			}
		});
		const sessionToken = await getUnixSessionToken(pid);
		const managed: ManagedProcess = {
			appId: id,
			operationId,
			pid,
			pty: ptyProcess,
			exited: exitResult.then(() => undefined),
			rootExited,
			knownPids: new Set([pid]),
			// node-pty uses forkpty/POSIX_SPAWN_SETSID on Unix, making the
			// returned PID the leader of a new process group and session.
			processGroupIds: new Set(isWindows ? [] : [pid]),
			sessionToken,
		};
		managedRef.current = managed;
		trackProcess(managed);
		if (rootExited) void releaseOwnershipWhenSessionExits(managed);

		if (!commandSpec.file && shellCommand) {
			if (isWindows) {
				ptyProcess.write(
					`@echo off\r\n${shellCommand}\r\nexit %ERRORLEVEL%\r\n`,
				);
			} else {
				ptyProcess.write(`${shellCommand}; exit $?\n`);
			}
		}

		let removeAbortListener = () => {};
		const aborted = new Promise<{ aborted: true }>((resolve) => {
			const onAbort = () => resolve({ aborted: true });
			if (deadline.signal.aborted) onAbort();
			else deadline.signal.addEventListener("abort", onAbort, { once: true });
			removeAbortListener = () =>
				deadline.signal.removeEventListener("abort", onAbort);
		});

		try {
			const outcome = await Promise.race([
				exitResult.then((result) => ({ aborted: false as const, ...result })),
				aborted,
			]);
			if (outcome.aborted) {
				await terminateManagedProcess(managed);
				const message = deadline.timedOut
					? "Command timed out"
					: "Command cancelled";
				io.to(id).emit(logs, {
					type: "status",
					status: "error",
					content: "Error detected",
				});
				return {
					code: deadline.timedOut ? 124 : 130,
					stdout: outputData,
					stderr: message,
				};
			}

			const exitCode = outcome.exitCode ?? 0;
			logger.info(
				`PTY Process (PID: ${pid}) finished with exit code ${exitCode}`,
			);
			if (exitCode !== 0) {
				io.to(id).emit(logs, {
					type: "status",
					status: "error",
					content: "Error detected",
				});
				log(
					io,
					id,
					`ERROR: Process finished with exit code ${exitCode}, please try again.`,
				);
			} else {
				io.to(id).emit(logs, {
					type: "status",
					status: "success",
					content: "Process finished successfully",
				});
			}
			return { code: exitCode, stdout: outputData, stderr: "" };
		} finally {
			removeAbortListener();
			dataDisposable.dispose();
			exitDisposable.dispose();
			socketOutput.close();
		}
	} catch (error: any) {
		const errorMsg = `Exception executing command: ${error.message}`;
		logger.error(errorMsg);
		io.to(id).emit(logs, {
			type: "status",
			status: "error",
			content: "Error detected",
		});
		return { code: -1, stdout: "", stderr: errorMsg };
	} finally {
		deadline.dispose();
		if (localOperation) finishOperation(localOperation);
	}
};

export const executeCommands = async (
	commands: Array<string | ProcessCommand>,
	workingDir: string,
	io: Server,
	id: string,
	needsBuildTools?: boolean,
	options?: {
		customEnv?: Record<string, string>;
		onOutput?: (text: string) => void;
		onProgress?: (progress: number) => void;
		signal?: AbortSignal;
		commandTimeoutMs?: number;
	},
): Promise<{ cancelled: boolean; id?: string }> => {
	const operation = beginOperation(id, options?.signal);
	try {
		const applicationRoot = await resolveContainedWorkingDirectory(workingDir);
		const currentPlatform = getPlatform();
		const { gpu: currentGpu } = await getSystemInfo();

		const totalCommands = commands.length;
		let completedCommands = 0;

		for (const cmd of commands) {
			if (operation.controller.signal.aborted) {
				logger.info(
					`Process with id ${id} cancelled - stopping remaining commands`,
				);
				log(
					io,
					id,
					`INFO: Process with id ${id} cancelled - stopping remaining commands`,
				);
				return { cancelled: true, id };
			}

			let command: ProcessCommand;

			if (typeof cmd === "string") {
				command = { command: cmd.trim() };
			} else if (typeof cmd === "object" && cmd !== null) {
				if (cmd.platform) {
					const cmdPlatform = cmd.platform.toLowerCase();
					const normalizedPlatform =
						currentPlatform === "win32"
							? "windows"
							: currentPlatform === "darwin"
								? "mac"
								: currentPlatform === "linux"
									? "linux"
									: currentPlatform;

					if (cmdPlatform !== normalizedPlatform) {
						logger.info(
							`Skipping command for platform ${cmdPlatform} on current platform ${currentPlatform}`,
						);
						log(
							io,
							id,
							`INFO: Skipping command for platform ${cmdPlatform} on current platform ${currentPlatform}`,
						);
						continue;
					}
				}

				if (cmd.gpus) {
					const allowedGpus = Array.isArray(cmd.gpus)
						? cmd.gpus.map((g: string) => g.toLowerCase())
						: [cmd.gpus.toLowerCase()];

					if (!allowedGpus.includes(currentGpu.toLowerCase())) {
						logger.info(
							`Skipping command for GPU ${allowedGpus.join(", ")} on current ${currentGpu} GPU`,
						);
						log(
							io,
							id,
							`INFO: Skipping command for GPU ${allowedGpus.join(", ")} on current ${currentGpu} GPU`,
						);
						continue;
					}
				}

				if (typeof cmd.command === "string" || typeof cmd.file === "string") {
					command = {
						...cmd,
						command: cmd.command?.trim(),
					};
				} else {
					logger.error(`Invalid command object: ${JSON.stringify(cmd)}`);
					log(io, id, `ERROR: Invalid command object: ${JSON.stringify(cmd)}`);
					continue;
				}
			} else {
				logger.error(`Invalid command type: ${typeof cmd}`);
				continue;
			}

			if (command.command || command.file) {
				const commandWorkingDir = await resolveContainedWorkingDirectory(
					applicationRoot,
					command.cwd,
				);
				let commandProgress = 0;
				let outputLines = 0;
				const startTime = Date.now();
				let lastProgressEmit = 0;
				let installingPackages = 0;
				let totalPackages = 0;

				if (options?.onProgress) {
					const baseProgress = completedCommands / totalCommands;
					options.onProgress(baseProgress);
				}

				const response = await executeCommand(
					command,
					io,
					commandWorkingDir,
					id,
					needsBuildTools,
					undefined,
					{
						customEnv: options?.customEnv,
						signal: operation.controller.signal,
						operationId: operation.id,
						timeoutMs: options?.commandTimeoutMs,
						onOutput: (text: string) => {
							options?.onOutput?.(text);

							outputLines++;
							const elapsed = Date.now() - startTime;

							const pipInstallMatch = text.match(/Collecting\s+(\S+)/i);
							const pipInstalledMatch = text.match(
								/Successfully\s+installed\s+(.+)/i,
							);
							const uvInstalledMatch = text.match(
								/Installed\s+(\d+)\s+package/i,
							);
							const uvResolvingMatch = text.match(
								/Resolved\s+(\d+)\s+package/i,
							);

							if (pipInstallMatch) {
								totalPackages++;
							}
							if (pipInstalledMatch) {
								const packages = pipInstalledMatch[1]
									.split(/\s+/)
									.filter((p) => p.trim());
								installingPackages = packages.length;
							}
							if (uvInstalledMatch) {
								installingPackages = Number.parseInt(uvInstalledMatch[1]);
							}
							if (uvResolvingMatch) {
								totalPackages = Number.parseInt(uvResolvingMatch[1]);
							}

							let packageProgress = 0;
							if (totalPackages > 0 && installingPackages > 0) {
								packageProgress = Math.min(
									0.95,
									installingPackages / totalPackages,
								);
							}

							const timeProgress = Math.min(
								0.85,
								Math.log(elapsed + 1000) / Math.log(300000),
							);

							const outputProgress = Math.min(
								0.85,
								Math.sqrt(outputLines / 100),
							);

							if (packageProgress > 0) {
								commandProgress = Math.max(commandProgress, packageProgress);
							} else {
								commandProgress = Math.max(
									commandProgress,
									Math.max(timeProgress, outputProgress),
								);
							}

							const overallProgress =
								(completedCommands + commandProgress) / totalCommands;

							const now = Date.now();
							if (now - lastProgressEmit > 300 && options?.onProgress) {
								options.onProgress(overallProgress);
								lastProgressEmit = now;
							}
						},
					},
				);

				if (response.code !== 0) {
					if (operation.controller.signal.aborted) {
						logger.info("Process was manually cancelled");
						log(io, id, "INFO: Process was manually cancelled");
						return { cancelled: true, id };
					}
					operation.controller.abort(
						new Error(`Command failed with exit code ${response.code}`),
					);
					await dropProcesses(id, undefined, operation.id);
					throw new Error(
						response.stderr || `Command failed with exit code ${response.code}`,
					);
				}

				completedCommands++;
				if (options?.onProgress) {
					options.onProgress(completedCommands / totalCommands);
				}
			}
		}
		return { cancelled: false };
	} finally {
		finishOperation(operation);
	}
};

export const getEnhancedEnv = async (needsBuildTools: boolean) => {
	const ENVIRONMENT = await getAllValues();

	if (ENVIRONMENT === null) {
		initDefaultEnv();
	}

	const baseEnv = {
		...ENVIRONMENT,
		...(process.platform === "win32" && {
			ComSpec: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
			SystemRoot: process.env.SystemRoot || "C:\\Windows",
			SystemDrive: process.env.SystemDrive || "C:",
			windir: process.env.windir || "C:\\Windows",
			USERPROFILE: process.env.USERPROFILE,
			APPDATA: process.env.APPDATA,
			LOCALAPPDATA: process.env.LOCALAPPDATA,
			PROGRAMFILES: process.env.PROGRAMFILES,
			"PROGRAMFILES(X86)": process.env["PROGRAMFILES(X86)"],
			HOMEDRIVE: process.env.HOMEDRIVE,
			HOMEPATH: process.env.HOMEPATH,
		}),
		PYTHONUNBUFFERED: "1",
		NODE_NO_BUFFERING: "1",
		FORCE_UNBUFFERED_OUTPUT: "1",
		PYTHONIOENCODING: "UTF-8",
		FORCE_COLOR: "1",
		GRADIO_SERVER_NAME: "0.0.0.0",
		...(process.platform === "win32" && {
			PROCESSOR_ARCHITECTURE:
				process.env.PROCESSOR_ARCHITECTURE ||
				(arch() === "x64" ? "AMD64" : arch() === "ia32" ? "x86" : "AMD64"),
			PROCESSOR_ARCHITEW6432: process.env.PROCESSOR_ARCHITEW6432 || "AMD64",
		}),
		CUDA_HOME:
			process.env.CUDA_HOME ||
			(() => {
				if (process.platform === "win32") {
					const cudaBasePath =
						"C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA";
					const versions = [
						"v13.0",
						"v12.9",
						"v12.8",
						"v12.7",
						"v12.6",
						"v12.5",
						"v12.4",
						"v12.3",
						"v12.2",
						"v12.1",
						"v12.0",
						"v11.8",
						"v11.7",
					];
					for (const version of versions) {
						const cudaPath = path.join(cudaBasePath, version);
						if (fs.existsSync(path.join(cudaPath, "bin", "nvcc.exe"))) {
							return cudaPath;
						}
					}
				} else if (process.platform === "linux") {
					const commonPaths = [
						"/usr/local/cuda",
						"/opt/cuda",
						"/usr/local/cuda-13.0",
						"/usr/local/cuda-12.9",
						"/usr/local/cuda-12.8",
						"/usr/local/cuda-12.7",
						"/usr/local/cuda-12.6",
						"/usr/local/cuda-12.5",
						"/usr/local/cuda-12.4",
						"/usr/local/cuda-12.3",
						"/usr/local/cuda-12.2",
						"/usr/local/cuda-12.1",
						"/usr/local/cuda-12.0",
						"/usr/local/cuda-11.8",
						"/usr/local/cuda-11.7",
					];
					for (const cudaPath of commonPaths) {
						if (fs.existsSync(path.join(cudaPath, "bin", "nvcc"))) {
							return cudaPath;
						}
					}
				}
				return undefined;
			})(),
		DS_BUILD_OPS: "0",
		DS_SKIP_CUDA_CHECK: "1",
		// fix git
		PATH: ENVIRONMENT.PATH,
	};

	const _cacheKey = "__buildToolsEnv";
	const _fnAny = executeCommand as unknown as Record<string, any>;

	const initializeBuildTools = async () => {
		logger.info("This script requires build tools. Initializing...");
		const buildTools = BuildToolsManager.getInstance();
		const buildToolsReady = await buildTools.initialize();

		if (!buildToolsReady) {
			logger.warn("Build tools initialization failed. Compilation may fail.");
			return baseEnv;
		}

		logger.info("Build tools ready for native compilation");
		return buildTools.getEnhancedEnvironment(ENVIRONMENT);
	};

	if (needsBuildTools) {
		if (!_fnAny[_cacheKey]) {
			_fnAny[_cacheKey] = await initializeBuildTools();
		} else {
			logger.info("Reusing cached build tools environment");
		}
		return _fnAny[_cacheKey];
	}
	return baseEnv;
};
