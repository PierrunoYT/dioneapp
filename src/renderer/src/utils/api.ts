const PORT_TTL_MS = 60_000;

let cachedPort: number | null = null;
let cachedAt = 0;
let isPortListenerRegistered = false;

interface PortOptions {
	forceRefresh?: boolean;
}

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const STATIC_OPERATIONS: Record<string, string> = {
	"GET /config": "config.get",
	"PATCH /config": "config.patch",
	"POST /config/reset": "config.reset",
	"POST /report": "report.submit",
	"POST /report/preview": "report.preview",
	"POST /deps/uninstall": "dependencies.uninstall",
	"POST /deps/in-use": "dependencies.inUse",
	"GET /local/": "local.list",
	"GET /scripts/installed": "scripts.installed",
	"POST /scripts/check-update": "scripts.checkUpdate",
	"GET /db/featured": "database.featured",
	"GET /db/explore": "database.explore",
	"GET /ai/ollama/models": "ai.models",
	"GET /ai/ollama/available-models": "ai.availableModels",
	"GET /ai/ollama/isinstalled": "ai.isInstalled",
	"POST /ai/ollama/install": "ai.install",
	"POST /ai/ollama/stop": "ai.stop",
	"POST /ai/ollama/start": "ai.start",
	"POST /ai/ollama/chat": "ai.chat",
};

const DYNAMIC_OPERATIONS = [
	["POST", /^\/deps\/install\/([^/]+)$/, "dependencies.install", ["id"]],
	["POST", /^\/deps\/cancel\/([^/]+)$/, "dependencies.cancel", ["id"]],
	["GET", /^\/db\/search\/name\/([^/]+)$/, "database.searchName", ["name"]],
	["GET", /^\/db\/search\/type\/([^/]+)$/, "database.searchType", ["type"]],
	["GET", /^\/db\/search\/([^/]+)$/, "database.search", ["id"]],
	["GET", /^\/searchbar\/name\/([^/]+)$/, "search.name", ["name"]],
	[
		"GET",
		/^\/searchbar\/type\/([^/]+)\/([^/]+)$/,
		"search.type",
		["name", "type"],
	],
	["GET", /^\/local\/installed\/([^/]+)$/, "local.installed", ["name"]],
	["GET", /^\/local\/get_app\/([^/]+)$/, "local.getApp", ["name"]],
	["GET", /^\/local\/get_id\/([^/]+)$/, "local.getId", ["id"]],
	["POST", /^\/local\/load\/([^/]+)$/, "local.load", ["name"]],
	["DELETE", /^\/local\/delete\/([^/]+)$/, "local.delete", ["name"]],
	[
		"POST",
		/^\/local\/upload\/([^/]+)\/([^/]+)\/([^/]+)\/?$/,
		"local.upload",
		["filePath", "name", "description"],
	],
	["GET", /^\/scripts\/installed\/([^/]+)$/, "scripts.isInstalled", ["name"]],
	["GET", /^\/scripts\/download\/([^/]+)\/?$/, "scripts.download", ["id"]],
	[
		"POST",
		/^\/scripts\/start\/([^/]+)\/([^/]+)$/,
		"scripts.start",
		["name", "id"],
	],
	[
		"GET",
		/^\/scripts\/stop\/([^/]+)\/([^/]+)$/,
		"scripts.stop",
		["name", "id"],
	],
	["GET", /^\/scripts\/delete\/([^/]+)$/, "scripts.delete", ["name"]],
	[
		"GET",
		/^\/scripts\/start-options\/([^/]+)$/,
		"scripts.startOptions",
		["name"],
	],
	[
		"GET",
		/^\/files\/(root|list|content)\/([^/]+)$/,
		"files.read",
		["action", "name"],
	],
	[
		"POST",
		/^\/files\/(save|delete|create|rename)\/([^/]+)$/,
		"files.mutate",
		["action", "name"],
	],
	["POST", /^\/ai\/ollama\/download-model$/, "ai.downloadModel", []],
] as const;

function resolveBackendOperation(value: string, method: string) {
	const url = new URL(
		value.startsWith("/") ? value : `/${value}`,
		"http://dione.invalid",
	);
	const query = Object.fromEntries(url.searchParams.entries());
	const staticOperation = STATIC_OPERATIONS[`${method} ${url.pathname}`];
	if (staticOperation) return { operation: staticOperation, params: query };
	for (const [routeMethod, pattern, operation, names] of DYNAMIC_OPERATIONS) {
		if (routeMethod !== method) continue;
		const match = url.pathname.match(pattern);
		if (!match) continue;
		const params: Record<string, string> = { ...query };
		names.forEach((name, index) => {
			params[name] = decodeURIComponent(match[index + 1]);
		});
		return { operation, params };
	}
	throw new Error("Unsupported backend operation");
}

const registerBackendPortListener = () => {
	if (isPortListenerRegistered) {
		return;
	}
	isPortListenerRegistered = true;
	window.dione.onBackendPortChanged((nextPort) => {
		if (typeof nextPort === "number" && Number.isFinite(nextPort)) {
			cachedPort = nextPort;
			cachedAt = Date.now();
		} else {
			invalidateBackendPort();
		}
	});
};

export const invalidateBackendPort = () => {
	cachedPort = null;
	cachedAt = 0;
};

export const getBackendPort = async (
	options?: PortOptions,
): Promise<number> => {
	registerBackendPortListener();
	const shouldForceRefresh = options?.forceRefresh === true;
	const isCacheValid =
		cachedPort !== null && Date.now() - cachedAt < PORT_TTL_MS;

	if (!shouldForceRefresh && isCacheValid) {
		return cachedPort as number;
	}

	const backendPort = await window.dione.getBackendPort();
	if (backendPort) {
		cachedPort = backendPort;
		cachedAt = Date.now();
		return backendPort;
	}

	throw new Error("Backend port is not available");
};

interface FetchOptions {
	forceRefreshPort?: boolean;
}

export class ApiError extends Error {
	readonly status: number;
	readonly response: Response;

	constructor(message: string, response: Response) {
		super(message);
		this.name = "ApiError";
		this.status = response.status;
		this.response = response;
	}
}

export const apiFetch = async (
	path: string | URL,
	init?: RequestInit,
	opts?: FetchOptions,
): Promise<Response> => {
	await getBackendPort({ forceRefresh: opts?.forceRefreshPort });
	const value = path instanceof URL ? path.toString() : path;
	if (isAbsoluteUrl(value))
		throw new Error("Backend requests must use relative paths");
	const call = resolveBackendOperation(
		value,
		(init?.method || "GET").toUpperCase(),
	);
	const headers = new Headers(init?.headers);
	const result = await window.dione.callBackend(call.operation, call.params, {
		headers: Object.fromEntries(headers.entries()),
		body: typeof init?.body === "string" ? init.body : undefined,
	});
	return new Response(result.body, {
		status: result.status,
		statusText: result.statusText,
		headers: result.headers,
	});
};

export const apiRequest = async (
	path: string | URL,
	init?: RequestInit,
	opts?: FetchOptions,
): Promise<Response> => {
	const response = await apiFetch(path, init, opts);
	if (response.ok) return response;

	let message = `Request failed with status ${response.status}`;
	const body = await response.clone().text();
	if (body) {
		try {
			const payload = JSON.parse(body) as {
				error?: unknown;
				message?: unknown;
			};
			const detail = payload.error ?? payload.message;
			if (typeof detail === "string" && detail.trim()) message = detail;
		} catch {
			message = body;
		}
	}
	throw new ApiError(message, response);
};

export const apiJson = async <T>(
	path: string | URL,
	init?: RequestInit,
	opts?: FetchOptions,
): Promise<T> => {
	const response = await apiRequest(path, init, opts);
	return (await response.json()) as T;
};
