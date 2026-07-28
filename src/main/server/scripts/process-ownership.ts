export interface ProcessSignalPlan {
	groupTargets: number[];
	pidTargets: number[];
}

export interface UnixSessionMember {
	pid: number;
	processGroupId: number;
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
