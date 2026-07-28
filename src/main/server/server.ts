import http from "node:http";
import { setupRoutes } from "@/server/routes/setup";
import { requireBackendAuth } from "@/server/security";
import logger from "@/server/utils/logger";
import { start as setupSocket } from "@/socket/socket";
import cors from "cors";
import express from "express";
import type { Server as SocketIOServer } from "socket.io";

let httpServer: http.Server | null = null;
let io: SocketIOServer | null = null;

export const start = async (): Promise<number> => {
	logger.info("Starting server...");
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

	const localServer = http.createServer(app);

	try {
		io = setupSocket(localServer);
		setupRoutes(app, io);

		return new Promise((resolve, reject) => {
			const onError = (error: Error) => {
				localServer.removeListener("listening", onListening);
				io?.close();
				io = null;
				logger.error("Error starting server:", error);
				reject(error);
			};
			const onListening = () => {
				localServer.removeListener("error", onError);
				const address = localServer.address();
				if (!address || typeof address === "string") {
					localServer.close();
					reject(new Error("Backend server did not receive a TCP port"));
					return;
				}
				logger.info(
					`Backend server started on http://localhost:${address.port}`,
				);
				httpServer = localServer;
				resolve(address.port);
			};

			localServer.once("error", onError);
			localServer.once("listening", onListening);
			localServer.listen(0, "127.0.0.1");
		});
	} catch (error) {
		logger.error("Error starting server:", error);
		throw error;
	}
};

export const stop = async () => {
	if (io) {
		io.sockets.disconnectSockets(true); // force disconnect
		io.close();
		io = null;
	}

	if (httpServer) {
		// close all socket connections
		const forceClose = () => {
			if (httpServer) {
				httpServer.closeAllConnections?.();
				httpServer.closeIdleConnections?.();
			}
		};

		// timeout to avoid blocking
		const timeout = setTimeout(() => {
			logger.warn("Forcing server closure");
			forceClose();
		}, 2000);

		await new Promise<void>((resolve) => {
			httpServer?.close(() => {
				clearTimeout(timeout);
				logger.info("Server stopped gracefully");
				resolve();
			});

			httpServer?.once("close", resolve);
		});

		httpServer = null;
	} else {
		logger.warn("Server already stopped");
	}
};
