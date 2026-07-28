export interface BackendIpc {
	invoke(channel: string, ...args: unknown[]): Promise<unknown>;
	send(channel: string, ...args: unknown[]): void;
}

export function createBackendCaller(ipc: BackendIpc, createId: () => string) {
	return (
		operation: string,
		params: Record<string, string>,
		init?: { headers?: Record<string, string>; body?: string },
	) => {
		const requestId = createId();
		let settled = false;
		const response = ipc
			.invoke("backend:call", requestId, operation, params, init)
			.finally(() => {
				settled = true;
			});
		return Object.freeze({
			response,
			cancel: () => {
				if (!settled) ipc.send("backend:cancel", requestId);
			},
		});
	};
}
