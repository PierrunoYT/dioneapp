import cors from "cors";
import express from "express";
import { requireBackendAuth } from "./security";

export function createBackendApp() {
	const app = express();
	app.use(
		cors({
			origin: (origin, callback) => {
				if (
					!origin ||
					origin === "null" ||
					origin === "http://localhost:2214" ||
					origin === "http://127.0.0.1:2214"
				) {
					callback(null, true);
					return;
				}
				callback(new Error("Origin is not allowed"));
			},
			methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
			allowedHeaders: ["Authorization", "Content-Type"],
		}),
	);
	app.use(requireBackendAuth);
	return app;
}
