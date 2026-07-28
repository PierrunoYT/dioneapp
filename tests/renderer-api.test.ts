import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";

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
