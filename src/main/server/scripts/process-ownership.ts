export interface ProcessSignalPlan {
	groupTargets: number[];
	pidTargets: number[];
}

export interface UnixSessionMember {
	pid: number;
	processGroupId: number;
}

export interface WindowsProcessEntry {
	pid: number;
	parentPid: number;
}

export function parseWindowsProcessEntries(
	value: unknown,
): WindowsProcessEntry[] {
	const entries = Array.isArray(value) ? value : [value];
	return entries.flatMap((entry) => {
		if (!entry || typeof entry !== "object") return [];
		const record = entry as Record<string, unknown>;
		const pid = Number(record.ProcessId);
		const parentPid = Number(record.ParentProcessId);
		return Number.isSafeInteger(pid) &&
			pid > 0 &&
			Number.isSafeInteger(parentPid) &&
			parentPid >= 0
			? [{ pid, parentPid }]
			: [];
	});
}

export function collectWindowsProcessTree(
	rootPid: number,
	entries: Iterable<WindowsProcessEntry>,
): number[] {
	if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return [];
	const children = new Map<number, number[]>();
	for (const { pid, parentPid } of entries) {
		const siblings = children.get(parentPid) ?? [];
		siblings.push(pid);
		children.set(parentPid, siblings);
	}
	const result = [rootPid];
	const seen = new Set(result);
	for (let index = 0; index < result.length; index++) {
		for (const child of children.get(result[index]) ?? []) {
			if (seen.has(child)) continue;
			seen.add(child);
			result.push(child);
		}
	}
	return result;
}

export function parseUnixSessionMembers(
	output: string,
	sessionToken: string,
): UnixSessionMember[] {
	const members: UnixSessionMember[] = [];
	for (const line of output.split("\n")) {
		const [pidText, processGroupText, token] = line.trim().split(/\s+/);
		const pid = Number(pidText);
		const processGroupId = Number(processGroupText);
		if (
			token === sessionToken &&
			Number.isSafeInteger(pid) &&
			Number.isSafeInteger(processGroupId)
		) {
			members.push({ pid, processGroupId });
		}
	}
	return members;
}

/**
 * Build a stable signal plan. On Unix, the negative process-group target is
 * authoritative; individual PIDs remain as a fallback for descendants that
 * changed process groups after they were observed.
 */
export function buildProcessSignalPlan(
	rootPid: number,
	knownPids: Iterable<number>,
	processGroupIds: Iterable<number> = [],
	platform: NodeJS.Platform = process.platform,
): ProcessSignalPlan {
	const pids = Array.from(
		new Set(
			Array.from(knownPids).filter(
				(pid) => Number.isSafeInteger(pid) && pid > 0,
			),
		),
	);
	const descendants = pids.filter((pid) => pid !== rootPid).reverse();
	const groupTargets =
		platform === "win32"
			? []
			: Array.from(
					new Set(
						Array.from(processGroupIds)
							.filter(
								(processGroupId) =>
									Number.isSafeInteger(processGroupId) && processGroupId > 0,
							)
							.map((processGroupId) => -processGroupId),
					),
				);

	return {
		groupTargets,
		pidTargets: [
			...descendants,
			...(groupTargets.length === 0 && pids.includes(rootPid) ? [rootPid] : []),
		],
	};
}

export function signalProcessPlan(
	plan: ProcessSignalPlan,
	signal: NodeJS.Signals,
	kill: (pid: number, signal: NodeJS.Signals) => void = process.kill,
	onError?: (target: number, error: NodeJS.ErrnoException) => void,
): void {
	const targets = [...plan.groupTargets, ...plan.pidTargets];
	for (const target of targets) {
		try {
			kill(target, signal);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
				onError?.(target, error as NodeJS.ErrnoException);
			}
		}
	}
}
