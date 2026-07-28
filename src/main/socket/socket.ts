import type http from "node:http";
import { sanitizeScriptName } from "@/server/scripts/utils/paths";
import { consumeSocketTicket } from "@/server/security";
import logger from "@/server/utils/logger";
import { Server } from "socket.io";

export const start = (httpServer: http.Server) => {
	logger.info("Connecting socket...");
	try {
		const io = new Server(httpServer, {
			cors: {
				origin: ["http://localhost:2214", "http://127.0.0.1:2214", "null"],
				methods: ["GET", "POST"],
			},
		});
		io.use((socket, next) => {
			try {
				const appId = sanitizeScriptName(socket.handshake.auth?.appId);
				if (!consumeSocketTicket(socket.handshake.auth?.ticket, appId)) {
					throw new Error("Unauthorized");
				}
				socket.data.appId = appId;
				next();
			} catch {
				next(new Error("Unauthorized"));
			}
		});

		io.on("connection", (socket) => {
			logger.info(`A user has connected to the server with ID: "${socket.id}"`);
			const appId = socket.data.appId as string;
			socket.join(appId);

			socket.on("connect_error", (err) => {
				logger.error(`Connection error: ${err.message}`);
			});

			socket.emit("message", "Welcome to the WebSocket server!");

			socket.on("installUpdate", (data) => {
				console.log("Received message from server:", data);
			});

			socket.on("disconnect", () => {
				logger.info(
					`A user has disconnected to the server with ID: "${socket.id}"`,
				);
			});
		});

		logger.info("Socket connected successfully");

		return io;
	} catch (error) {
		logger.error("Failed to start socket connection:", error);
		throw error;
	}
};
