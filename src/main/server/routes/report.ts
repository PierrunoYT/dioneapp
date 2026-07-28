import { supabase } from "@/server/utils/database";
import logger from "@/server/utils/logger";
import { prepareSafeReport } from "@/utils/privacy";
import express from "express";

const router = express.Router();
router.use(express.json({ limit: "24kb" }));

router.post("/preview", (req, res) => {
	try {
		return res.status(200).json({ report: prepareSafeReport(req.body) });
	} catch {
		return res.status(400).json({ error: "Invalid report" });
	}
});

router.post("/", async (req, res) => {
	if (req.body?.consent !== true) {
		return res.status(400).json({ error: "Report consent is required" });
	}

	if (!supabase) {
		logger.error("Supabase client is not initialized");
		return res.status(500).json({ error: "Database connection not available" });
	}

	try {
		const report = prepareSafeReport(req.body);
		const { error } = await supabase.from("reports").insert(report);
		if (error) {
			logger.error(`Unable to store report (code=${error.code || "unknown"})`);
			res.status(500).json({ error: "Unable to store report" });
		} else {
			res.status(200).json({ success: true });
			logger.info(`Report stored type=${report.type}`);
		}
	} catch (error: any) {
		if (error instanceof TypeError) {
			return res.status(400).json({ error: "Invalid report" });
		}
		logger.error(`Error storing report (code=${error?.code || "unknown"})`);
		res.status(500).json({ error: "Unable to store report" });
	}
});

export default router;
