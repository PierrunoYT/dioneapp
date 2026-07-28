import { catalogApiEnabled } from "@/server/utils/features";
import logger from "@/server/utils/logger";
import express from "express";

const router = express.Router();
router.use(express.json());

// With the hosted catalog disabled there is nothing to query, so list endpoints
// answer with an empty result rather than reaching the network or erroring. The
// renderer already renders an empty feed for this shape.
function catalogDisabled(route: string): boolean {
	if (catalogApiEnabled) return false;
	logger.info(`Catalog API disabled, returning no results for ${route}`);
	return true;
}

router.get("/featured", (_req, res) => {
	if (catalogDisabled("/db/featured")) return res.send([]);
	async function getData() {
		const response = await fetch(
			"https://api-getdione-app.deeivihh.workers.dev/v1/scripts?limit=4&order_type=desc&featured=true",
			{
				headers: {
					...(process.env.DIONE_API_KEY
						? {
								Authorization: `Bearer ${process.env.DIONE_API_KEY}`,
							}
						: {}),
				},
			},
		);
		let data: any = [];
		try {
			const contentType = response.headers.get("content-type") || "";
			if (contentType.includes("application/json")) {
				data = await response.json();
			} else {
				const text = await response.text();
				logger.warn(
					`Dione API /scripts featured returned non-JSON (${contentType || "unknown"}).`,
				);
				try {
					data = JSON.parse(text);
				} catch {
					data = [];
				}
			}
		} catch (e: any) {
			logger.error(
				`Failed to parse featured scripts response: ${e?.message || e}`,
			);
			data = [];
		}
		if (response.status !== 200) {
			logger.error(
				`Unable to obtain the scripts: [ (${response.status}) ${response.statusText} ]`,
			);
			res.send(response.statusText);
			return;
		}

		const filteredData = data.filter(
			(script: { featured: boolean }) => script.featured,
		);
		res.send(filteredData);
	}
	getData();
});

router.get("/explore", (req, res) => {
	if (catalogDisabled("/db/explore")) return res.json([]);
	const page = req.query.page ? Number.parseInt(req.query.page as string) : 1;
	const limit = req.query.limit
		? Number.parseInt(req.query.limit as string)
		: 20;

	async function getData() {
		try {
			const response = await fetch(
				`https://api-getdione-app.deeivihh.workers.dev/v1/scripts?page=${page}&limit=${limit}&order=${req.query.order_by || "created_at"}&order_type=${req.query.order_type || "asc"}`,
				{
					headers: {
						...(process.env.DIONE_API_KEY
							? {
									Authorization: `Bearer ${process.env.DIONE_API_KEY}`,
								}
							: {}),
					},
				},
			);

			if (response.status !== 200) {
				logger.error(
					`Fetch failed: [${response.status}] ${response.statusText}`,
				);
				return res.status(response.status).json({
					error: `Dione API error: ${response.statusText}`,
				});
			}

			let data: any = null;
			try {
				const contentType = response.headers.get("content-type") || "";
				if (contentType.includes("application/json")) {
					data = await response.json();
				} else {
					const text = await response.text();
					logger.warn(
						`Dione API /scripts explore returned non-JSON (${contentType || "unknown"}).`,
					);
					try {
						data = JSON.parse(text);
					} catch {
						data = [];
					}
				}
			} catch (e: any) {
				logger.error(
					`Failed to parse explore scripts response: ${e?.message || e}`,
				);
				data = [];
			}

			if (data.status === 404) {
				return res.json(data);
			}

			const scripts = data.map((script: any) => ({
				...script,
				logo_url: script.logo_url || "no-logo",
			}));

			res.json(scripts);
		} catch (error: any) {
			logger.error(`Critical error: ${error.message}`);
			res.status(500).json({ error: "Internal server error" });
		}
	}

	getData();
});

// search
router.get("/search/:id", (req, res) => {
	if (catalogDisabled("/db/search/:id")) {
		return res
			.status(404)
			.json({ error: "Script catalog is disabled", disabled: true });
	}
	async function getData() {
		logger.info(`Searching script with ID: "${req.params.id}"`);
		const response = await fetch(
			`https://api-getdione-app.deeivihh.workers.dev/v1/scripts?id=${req.params.id}&limit=1`,
			{
				headers: {
					...(process.env.DIONE_API_KEY
						? {
								Authorization: `Bearer ${process.env.DIONE_API_KEY}`,
							}
						: {}),
				},
			},
		);
		let data: any = null;
		try {
			const contentType = response.headers.get("content-type") || "";
			if (contentType.includes("application/json")) {
				data = await response.json();
			} else {
				const text = await response.text();
				logger.warn(
					`Dione API /scripts?id= returned non-JSON (${contentType || "unknown"}).`,
				);
				try {
					data = JSON.parse(text);
				} catch {
					data = [];
				}
			}
		} catch (e: any) {
			logger.error(`Failed to parse search by id response: ${e?.message || e}`);
			data = [];
		}
		if (response.status !== 200) {
			logger.error(
				`Unable to obtain the scripts: [ (${response.status}) ${response.statusText} ]`,
			);
			res.send(response.statusText);
			return;
		}
		const script = data[0];
		if (
			script?.logo_url === null ||
			script?.logo_url === undefined ||
			script?.logo_url === "" ||
			!script
		) {
			script.logo_url = "no-logo";
		}
		res.send(script);
		return;
	}
	getData();
});

router.get("/search/name/:name", async (req, res) => {
	if (catalogDisabled("/db/search/name")) return res.send([]);
	if (!req.params.name) return;
	if (req.params.name.length === 0) return;
	async function getData() {
		const sanitizedName = req.params.name
			.replace(/-/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		const page = req.query.page ? Number.parseInt(req.query.page as string) : 1;
		const limit = req.query.limit
			? Number.parseInt(req.query.limit as string)
			: 20;
		const orderBy = (req.query.order_by as string) || null;
		const orderType = (req.query.order_type as string) || "asc";
		if (sanitizedName) {
			const url = new URL(
				"https://api-getdione-app.deeivihh.workers.dev/v1/scripts",
			);
			url.searchParams.set("q", sanitizedName);
			url.searchParams.set("page", String(page));
			url.searchParams.set("limit", String(limit));
			if (orderBy) url.searchParams.set("order", orderBy);
			if (orderType) url.searchParams.set("order_type", orderType);
			const response = await fetch(url.toString(), {
				headers: {
					...(process.env.DIONE_API_KEY
						? { Authorization: `Bearer ${process.env.DIONE_API_KEY}` }
						: {}),
				},
			});
			let data: any = null;
			try {
				const contentType = response.headers.get("content-type") || "";
				if (contentType.includes("application/json")) {
					data = await response.json();
				} else {
					const text = await response.text();
					logger.warn(
						`Dione API /scripts?q= returned non-JSON (${contentType || "unknown"}).`,
					);
					try {
						data = JSON.parse(text);
					} catch {
						data = [];
					}
				}
			} catch (e: any) {
				logger.error(
					`Failed to parse search by name response: ${e?.message || e}`,
				);
				data = [];
			}
			if (response.status !== 200) {
				logger.error(
					`Unable to obtain the scripts: [ (${response.status}) ${response.statusText} ]`,
				);
				return res.status(response.status).json({ error: response.statusText });
			}

			if (!data || !Array.isArray(data)) {
				if (data.status === 404) {
					logger.warn(
						`Script not found in DB: ${sanitizedName} (probably is local).`,
					);
					return res.json([]);
				}
				logger.warn("Invalid data format from API.");
				return res.send([]);
			}

			const scripts = data.map((script: any) => {
				if (
					script.logo_url === null ||
					script.logo_url === undefined ||
					script.logo_url === ""
				) {
					script.logo_url = "no-logo";
				}
				return script;
			});

			if (scripts.length === 0) {
				return res.json({ status: 404 });
			}

			return res.send(scripts);
		}
	}
	getData();
});

router.get("/search/type/:type", async (req, res) => {
	if (catalogDisabled("/db/search/type")) return res.send([]);
	if (!req.params.type) return;
	if (req.params.type.length === 0) return;
	async function getData() {
		const type = req.params.type;
		const page = req.query.page ? Number.parseInt(req.query.page as string) : 1;
		const limit = req.query.limit
			? Number.parseInt(req.query.limit as string)
			: 20;
		const orderBy = (req.query.order_by as string) || null;
		const orderType = (req.query.order_type as string) || "asc";

		const url = new URL(
			"https://api-getdione-app.deeivihh.workers.dev/v1/scripts",
		);
		url.searchParams.set("tags", type);
		url.searchParams.set("page", String(page));
		url.searchParams.set("limit", String(limit));
		if (orderBy) url.searchParams.set("order", orderBy);
		if (orderType) url.searchParams.set("order_type", orderType);

		const response = await fetch(url.toString(), {
			headers: {
				...(process.env.DIONE_API_KEY
					? {
							Authorization: `Bearer ${process.env.DIONE_API_KEY}`,
						}
					: {}),
			},
		});
		let data: any = null;
		try {
			const contentType = response.headers.get("content-type") || "";
			if (contentType.includes("application/json")) {
				data = await response.json();
			} else {
				const text = await response.text();
				logger.warn(
					`Dione API /scripts?tags= returned non-JSON (${contentType || "unknown"}).`,
				);
				try {
					data = JSON.parse(text);
				} catch {
					data = [];
				}
			}
		} catch (e: any) {
			logger.error(
				`Failed to parse search by type response: ${e?.message || e}`,
			);
			data = [];
		}
		if (response.status !== 200) {
			logger.error(
				`Unable to obtain the scripts: [ (${response.status}) ${response.statusText} ]`,
			);
			return res.status(response.status).json({ error: response.statusText });
		}

		if (!data || !Array.isArray(data)) {
			logger.error("Invalid data format from API, probably no scripts found.");
			return res.send([]);
		}

		const scripts = data.map((script: any) => {
			if (
				script?.logo_url === null ||
				script?.logo_url === undefined ||
				script?.logo_url === ""
			) {
				script.logo_url = "no-logo";
			}
			return script;
		});

		if (scripts.length === 0) {
			return res.json({ status: 404 });
		}

		return res.send(scripts);
	}
	getData();
});

export default router;
