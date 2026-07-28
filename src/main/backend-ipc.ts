export interface BackendRequest {
	method: "GET" | "POST" | "PATCH" | "DELETE";
	path: string;
}

const text = (params: Record<string, unknown>, name: string, max = 512) => {
	const value = params[name];
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > max ||
		/[\0\r\n]/.test(value)
	)
		throw new Error(`Invalid backend parameter: ${name}`);
	return encodeURIComponent(value);
};

const query = (params: Record<string, unknown>, allowed: string[]) => {
	const result = new URLSearchParams();
	for (const name of allowed) {
		if (params[name] !== undefined)
			result.set(name, decodeURIComponent(text(params, name, 4096)));
	}
	return result.toString();
};

/** The complete, closed renderer-to-backend HTTP capability map. */
export function resolveBackendRequest(
	operation: string,
	params: Record<string, unknown>,
): BackendRequest {
	const v = (name: string, max?: number) => text(params, name, max);
	const q = (allowed: string[]) => query(params, allowed);
	const fixed: Record<string, BackendRequest> = {
		"config.get": { method: "GET", path: "/config" },
		"config.patch": { method: "PATCH", path: "/config" },
		"config.reset": { method: "POST", path: "/config/reset" },
		"report.submit": { method: "POST", path: "/report" },
		"report.preview": { method: "POST", path: "/report/preview" },
		"dependencies.uninstall": { method: "POST", path: "/deps/uninstall" },
		"dependencies.inUse": { method: "POST", path: "/deps/in-use" },
		"local.list": { method: "GET", path: "/local/" },
		"scripts.installed": { method: "GET", path: "/scripts/installed" },
		"scripts.checkUpdate": { method: "POST", path: "/scripts/check-update" },
		"ai.models": { method: "GET", path: "/ai/ollama/models" },
		"ai.availableModels": {
			method: "GET",
			path: "/ai/ollama/available-models",
		},
		"ai.isInstalled": { method: "GET", path: "/ai/ollama/isinstalled" },
		"ai.install": { method: "POST", path: "/ai/ollama/install" },
		"ai.stop": { method: "POST", path: "/ai/ollama/stop" },
		"ai.start": { method: "POST", path: "/ai/ollama/start" },
		"ai.chat": { method: "POST", path: "/ai/ollama/chat" },
	};
	if (fixed[operation]) return fixed[operation];
	const dynamic: Record<string, () => BackendRequest> = {
		"dependencies.install": () => ({
			method: "POST",
			path: `/deps/install/${v("id")}`,
		}),
		"dependencies.cancel": () => ({
			method: "POST",
			path: `/deps/cancel/${v("id")}`,
		}),
		"database.featured": () => ({
			method: "GET",
			path: `/db/featured?${q(["page", "limit"])}`,
		}),
		"database.explore": () => ({
			method: "GET",
			path: `/db/explore?${q(["page", "limit", "order_by", "order_type"])}`,
		}),
		"database.search": () => ({ method: "GET", path: `/db/search/${v("id")}` }),
		"database.searchName": () => ({
			method: "GET",
			path: `/db/search/name/${v("name")}`,
		}),
		"database.searchType": () => ({
			method: "GET",
			path: `/db/search/type/${v("type")}?${q(["page", "limit", "order_by", "order_type"])}`,
		}),
		"search.name": () => ({
			method: "GET",
			path: `/searchbar/name/${v("name")}?${q(["page", "limit", "order_by", "order_type"])}`,
		}),
		"search.type": () => ({
			method: "GET",
			path: `/searchbar/type/${v("name")}/${v("type")}?${q(["page", "limit", "order_by", "order_type"])}`,
		}),
		"local.installed": () => ({
			method: "GET",
			path: `/local/installed/${v("name")}`,
		}),
		"local.getApp": () => ({
			method: "GET",
			path: `/local/get_app/${v("name")}`,
		}),
		"local.getId": () => ({ method: "GET", path: `/local/get_id/${v("id")}` }),
		"local.load": () => ({ method: "POST", path: `/local/load/${v("name")}` }),
		"local.delete": () => ({
			method: "DELETE",
			path: `/local/delete/${v("name")}`,
		}),
		"local.upload": () => ({
			method: "POST",
			path: `/local/upload/${v("filePath", 4096)}/${v("name")}/${v("description", 4096)}`,
		}),
		"scripts.isInstalled": () => ({
			method: "GET",
			path: `/scripts/installed/${v("name")}`,
		}),
		"scripts.download": () => ({
			method: "GET",
			path: `/scripts/download/${v("id")}${params.force === "true" ? "?force=true" : ""}`,
		}),
		"scripts.start": () => ({
			method: "POST",
			path: `/scripts/start/${v("name")}/${v("id")}${params.start ? `?start=${v("start")}` : ""}`,
		}),
		"scripts.stop": () => ({
			method: "GET",
			path: `/scripts/stop/${v("name")}/${v("id")}`,
		}),
		"scripts.delete": () => ({
			method: "GET",
			path: `/scripts/delete/${v("name")}`,
		}),
		"scripts.startOptions": () => ({
			method: "GET",
			path: `/scripts/start-options/${v("name")}`,
		}),
		"ai.downloadModel": () => ({
			method: "POST",
			path: `/ai/ollama/download-model?model=${v("model")}`,
		}),
	};
	if (operation === "files.read") {
		if (!["root", "list", "content"].includes(String(params.action)))
			throw new Error("Invalid file read operation");
		return {
			method: "GET",
			path: `/files/${params.action}/${v("name")}?${q(["appId", "dir", "file"])}`,
		};
	}
	if (operation === "files.mutate") {
		if (!["save", "delete", "create", "rename"].includes(String(params.action)))
			throw new Error("Invalid file mutation operation");
		return {
			method: "POST",
			path: `/files/${params.action}/${v("name")}?${q(["appId"])}`,
		};
	}
	const factory = dynamic[operation];
	if (!factory) throw new Error("Unsupported backend operation");
	return factory();
}

export function isExactTrustedSender<T>(
	sender: T,
	senderFrame: unknown,
	trustedSender: T | undefined,
	trustedMainFrame: unknown,
): boolean {
	return (
		trustedSender !== undefined &&
		sender === trustedSender &&
		senderFrame === trustedMainFrame
	);
}

export class BackendCallRegistry<T> {
	readonly calls = new Map<string, { controller: AbortController; owner: T }>();

	begin(id: string, owner: T) {
		if (this.calls.has(id)) throw new Error("Duplicate backend request ID");
		const call = { controller: new AbortController(), owner };
		this.calls.set(id, call);
		return call;
	}

	finish(id: string, call: { controller: AbortController; owner: T }) {
		if (this.calls.get(id) === call) this.calls.delete(id);
	}

	cancel(id: string, owner: T): boolean {
		const call = this.calls.get(id);
		if (call?.owner !== owner) return false;
		call.controller.abort();
		return true;
	}

	abortOwner(owner: T) {
		for (const call of this.calls.values())
			if (call.owner === owner) call.controller.abort();
	}
}
