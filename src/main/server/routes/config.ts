import {
	deleteConfig,
	parseConfigPatch,
	readConfig,
	resetConfig,
	updateConfig,
} from "@/config";
import { toggleDiscordRPC } from "@/discord/presence";
import express from "express";

const router = express.Router();
router.use(express.json());

// read config
router.get("/", (_req, res) => {
	const config = readConfig();
	res.send(config);
});

// update config
const patchConfig = async (req: express.Request, res: express.Response) => {
	try {
		const patch = parseConfigPatch(req.body);
		const currentConfig = readConfig();
		const updatedConfig = updateConfig(patch);

		if (
			patch.enableDiscordRPC !== undefined &&
			patch.enableDiscordRPC !== currentConfig.enableDiscordRPC
		) {
			await toggleDiscordRPC(patch.enableDiscordRPC);
		}

		res.send(updatedConfig);
	} catch (error) {
		res.status(400).send({ error: (error as Error).message });
	}
};

router.patch("/", patchConfig);
// Compatibility for older renderers. Both routes use the same strict schema.
router.post("/update", patchConfig);

router.post("/reset", (_req, res) => {
	try {
		console.log("trying to reset config");
		resetConfig();
		res.send(readConfig());
	} catch (error) {
		res.status(400).send({ error: "Failed to reset configuration" });
	}
});

router.post("/delete", (_req, res) => {
	try {
		console.log("trying to delete config");
		deleteConfig();
		res.send({ success: true });
	} catch (error) {
		res.status(400).send({ error: "Failed to delete configuration" });
	}
});

export default router;
