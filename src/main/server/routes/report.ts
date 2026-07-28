import { supabase } from "@/server/utils/database";
import logger from "@/server/utils/logger";
import express from "express";

const router = express.Router();
router.use(express.json({ limit: "32kb" }));

router.post("/", async (req, res) => {
	const { type, script, ai, details } = req.body ?? {};
	if (!["script", "ai", "user", "error"].includes(type)) {
		return res.status(400).json({ error: "Invalid report type" });
	}

	if (!supabase) {
		logger.error("Supabase client is not initialized");
		return res.status(500).json({ error: "Database connection not available" });
	}

	try {
		const report: Record<string, string> = { type };

		if (type === "script") {
			if (
				typeof script?.appid !== "string" ||
				typeof script?.details !== "string"
			) {
				return res.status(400).json({ error: "Invalid script report" });
			}
			report.appid = script.appid.slice(0, 256);
			report.details = script.details.slice(0, 16_000);
		} else if (type === "ai") {
			if (
				typeof ai?.model !== "string" ||
				typeof ai?.input !== "string" ||
				typeof ai?.output !== "string"
			) {
				return res.status(400).json({ error: "Invalid AI report" });
			}
			report.model = ai.model.slice(0, 256);
			report.input = ai.input.slice(0, 16_000);
			report.output = ai.output.slice(0, 16_000);
		} else {
			if (typeof details !== "string" || details.length === 0) {
				return res.status(400).json({ error: "Invalid report details" });
			}
			report.details = details.slice(0, 16_000);
		}

		const { error } = await supabase.from("reports").insert(report);
		if (error) {
			logger.error(
				`Unable to report: [ (${error.code || "No code"}) ${error.details || "No details"} ]`,
			);
			res.status(500).send(error);
		} else {
			res.status(200).json({ success: true });
			logger.info(`Report stored type=${type}`);
		}
	} catch (error: any) {
		logger.error(
			`Error reporting: [ (${error.code || "No code"}) ${error.message || "No details"} ]`,
		);
		res.status(500).send("An error occurred while processing your request.");
	}
});

export default router;
