import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { resolveBackendRequest } from "../src/main/backend-ipc";

type BackendResult = {
	status: number;
	statusText: string;
	headers: [string, string][];
	body: string;
};

let backendResult: BackendResult;
let backendCall:
	| { operation: string; params: Record<string, string> }
	| undefined;
let api: typeof import("../src/renderer/src/utils/api");

before(async () => {
	(globalThis as any).window = {
		dione: {
			onBackendPortChanged: () => {},
			getBackendPort: async () => 3210,
			callBackend: (operation: string, params: Record<string, string>) => {
				backendCall = { operation, params };
				return {
					response: Promise.resolve(backendResult),
					cancel: () => {},
				};
			},
		},
	};
	api = await import("../src/renderer/src/utils/api");
});

beforeEach(() => {
	backendCall = undefined;
	backendResult = {
		status: 200,
		statusText: "OK",
		headers: [["content-type", "application/json"]],
		body: "{}",
	};
});

test("renderer API rejects absolute and unsupported backend operations", async () => {
	await assert.rejects(
		() =>
			api.apiFetch("https://example.com/config", undefined, {
				forceRefreshPort: true,
			}),
		/relative paths/,
	);
	await assert.rejects(
		() => api.apiFetch("/unknown", undefined, { forceRefreshPort: true }),
		/Unsupported backend operation/,
	);
	assert.equal(backendCall, undefined);
});

test("renderer API maps allowlisted dynamic operations and decoded parameters", async () => {
	await api.apiFetch(
		"/scripts/start/demo/app-id?start=Development%20Mode",
		{
			method: "POST",
		},
		{ forceRefreshPort: true },
	);
	assert.deepEqual(backendCall, {
		operation: "scripts.start",
		params: {
			name: "demo",
			id: "app-id",
			start: "Development Mode",
		},
	});
});

test("every renderer capability round-trips through the closed main operation map", () => {
	const routes: Array<[string, string]> = [
		["GET", "/config"],
		["PATCH", "/config"],
		["POST", "/config/reset"],
		["POST", "/report"],
		["POST", "/report/preview"],
		["POST", "/deps/uninstall"],
		["POST", "/deps/in-use"],
		["POST", "/deps/install/app"],
		["POST", "/deps/cancel/app"],
		["GET", "/db/featured?page=1&limit=20"],
		["GET", "/db/explore?page=1&limit=20&order_by=name&order_type=asc"],
		["GET", "/db/search/app"],
		["GET", "/db/search/name/demo"],
		["GET", "/db/search/type/tool?page=1&limit=20"],
		["GET", "/searchbar/name/demo?page=1"],
		["GET", "/searchbar/type/demo/tool?page=1"],
		["GET", "/local/"],
		["GET", "/local/installed/demo"],
		["GET", "/local/get_app/demo"],
		["GET", "/local/get_id/app"],
		["POST", "/local/load/demo"],
		["DELETE", "/local/delete/demo"],
		["POST", "/local/upload/path/demo/description"],
		["GET", "/scripts/installed"],
		["GET", "/scripts/installed/demo"],
		["POST", "/scripts/check-update"],
		["GET", "/scripts/download/app?force=true"],
		["POST", "/scripts/start/demo/app?start=Development"],
		["GET", "/scripts/stop/demo/app"],
		["GET", "/scripts/delete/demo"],
		["GET", "/scripts/start-options/demo"],
		["GET", "/files/root/demo?appId=app"],
		["GET", "/files/list/demo?appId=app&dir=src"],
		["GET", "/files/content/demo?appId=app&dir=src&file=index.ts"],
		["POST", "/files/save/demo?appId=app"],
		["POST", "/files/delete/demo?appId=app"],
		["POST", "/files/create/demo?appId=app"],
		["POST", "/files/rename/demo?appId=app"],
		["GET", "/ai/ollama/models"],
		["GET", "/ai/ollama/available-models"],
		["GET", "/ai/ollama/isinstalled"],
		["POST", "/ai/ollama/install"],
		["POST", "/ai/ollama/stop"],
		["POST", "/ai/ollama/start"],
		["POST", "/ai/ollama/chat"],
		["POST", "/ai/ollama/download-model?model=llama3"],
	];

	for (const [method, route] of routes) {
		const rendererRequest = api.resolveBackendOperation(route, method);
		const mainRequest = resolveBackendRequest(
			rendererRequest.operation,
			rendererRequest.params,
		);
		assert.equal(mainRequest.method, method, route);
		assert.equal(mainRequest.path, route, route);
	}
});

test("renderer abort owns one backend cancellation, removes its listener, and rejects late completion", async () => {
	const controller = new AbortController();
	const reason = new Error("request cancelled");
	let resolveBackend!: (result: BackendResult) => void;
	let cancellations = 0;
	let addedListener: EventListenerOrEventListenerObject | undefined;
	let removedListener: EventListenerOrEventListenerObject | undefined;
	const addEventListener = controller.signal.addEventListener.bind(
		controller.signal,
	);
	const removeEventListener = controller.signal.removeEventListener.bind(
		controller.signal,
	);
	controller.signal.addEventListener = ((type, listener, options) => {
		if (type === "abort") addedListener = listener;
		addEventListener(type, listener, options);
	}) as typeof controller.signal.addEventListener;
	controller.signal.removeEventListener = ((type, listener, options) => {
		if (type === "abort") removedListener = listener;
		removeEventListener(type, listener, options);
	}) as typeof controller.signal.removeEventListener;

	const originalCallBackend = window.dione.callBackend;
	window.dione.callBackend = () => ({
		response: new Promise<BackendResult>((resolve) => {
			resolveBackend = resolve;
		}),
		cancel: () => {
			cancellations++;
		},
	});
	try {
		const request = api.apiFetch(
			"/config",
			{ signal: controller.signal },
			{ forceRefreshPort: true },
		);
		await new Promise((resolve) => setImmediate(resolve));
		controller.abort(reason);
		resolveBackend(backendResult);
		await assert.rejects(request, (error: unknown) => error === reason);
		assert.equal(cancellations, 1);
		assert.equal(removedListener, addedListener);
	} finally {
		window.dione.callBackend = originalCallBackend;
	}
});

test("renderer API surfaces JSON error details on non-2xx responses", async () => {
	backendResult = {
		status: 401,
		statusText: "Unauthorized",
		headers: [["content-type", "application/json"]],
		body: JSON.stringify({ error: "Authentication required" }),
	};
	await assert.rejects(
		() => api.apiRequest("/config", undefined, { forceRefreshPort: true }),
		(error: unknown) => {
			assert.ok(error instanceof api.ApiError);
			assert.equal(error.status, 401);
			assert.equal(error.message, "Authentication required");
			return true;
		},
	);
});

test("renderer API surfaces text and default errors on non-2xx responses", async () => {
	backendResult = {
		status: 500,
		statusText: "Internal Server Error",
		headers: [],
		body: "backend failed",
	};
	await assert.rejects(
		() => api.apiRequest("/config", undefined, { forceRefreshPort: true }),
		/ backend failed|backend failed/,
	);
	backendResult.body = "";
	await assert.rejects(
		() => api.apiRequest("/config", undefined, { forceRefreshPort: true }),
		/Request failed with status 500/,
	);
});

test("renderer API parses successful JSON responses", async () => {
	backendResult.body = JSON.stringify({ secure: true });
	assert.deepEqual(
		await api.apiJson<{ secure: boolean }>("/config", undefined, {
			forceRefreshPort: true,
		}),
		{ secure: true },
	);
});
