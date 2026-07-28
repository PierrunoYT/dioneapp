import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { Server as SocketIOServer } from "socket.io";
import { type Socket, io as createSocket } from "socket.io-client";
import { createBackendApp } from "../src/main/server/backend-app";
import {
	createSocketTicket,
	getBackendToken,
} from "../src/main/server/security";
import { authenticateSocket } from "../src/main/socket/auth";

function connect(
	url: string,
	auth: { appId: string; ticket: string },
): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = createSocket(url, {
			auth,
			forceNew: true,
			reconnection: false,
			transports: ["websocket"],
			timeout: 1_000,
		});
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error("Timed out waiting for Socket.IO authentication"));
		}, 1_500);
		socket.once("connect", () => {
			clearTimeout(timeout);
			resolve(socket);
		});
		socket.once("connect_error", (error) => {
			clearTimeout(timeout);
			socket.close();
			reject(error);
		});
	});
}

async function rejectsConnection(
	url: string,
	auth: { appId: string; ticket: string },
): Promise<void> {
	await assert.rejects(() => connect(url, auth), /Unauthorized/);
}

test("CORS preflight precedes auth while application routes remain protected", async () => {
	const app = createBackendApp();
	app.get("/protected", (_request, response) => response.sendStatus(204));
	const server = http.createServer(app);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	try {
		const url = `http://127.0.0.1:${address.port}/protected`;
		const preflight = await fetch(url, {
			method: "OPTIONS",
			headers: {
				Origin: "http://localhost:2214",
				"Access-Control-Request-Method": "GET",
			},
		});
		assert.equal(preflight.status, 204);
		assert.equal(
			preflight.headers.get("access-control-allow-origin"),
			"http://localhost:2214",
		);
		assert.equal((await fetch(url)).status, 401);
		assert.equal(
			(
				await fetch(url, {
					headers: { Authorization: `Bearer ${getBackendToken()}` },
				})
			).status,
			204,
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test(
	"Socket.IO handshake enforces ticket expiry, replay protection, and app scope",
	{ timeout: 8_000 },
	async () => {
		let now = 10_000;
		const server = http.createServer();
		const io = new SocketIOServer(server);
		io.use((socket, next) => authenticateSocket(socket, next, () => now));
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const url = `http://127.0.0.1:${address.port}`;
		const sockets: Socket[] = [];
		try {
			const validTicket = createSocketTicket("app-one", now);
			const socket = await connect(url, {
				appId: "app-one",
				ticket: validTicket,
			});
			sockets.push(socket);
			assert.equal(socket.connected, true);
			await rejectsConnection(url, {
				appId: "app-one",
				ticket: validTicket,
			});

			const wrongAppTicket = createSocketTicket("app-one", now);
			await rejectsConnection(url, {
				appId: "app-two",
				ticket: wrongAppTicket,
			});
			await rejectsConnection(url, {
				appId: "app-one",
				ticket: wrongAppTicket,
			});

			const expiredTicket = createSocketTicket("app-one", now);
			now += 60_001;
			await rejectsConnection(url, {
				appId: "app-one",
				ticket: expiredTicket,
			});
		} finally {
			for (const socket of sockets) socket.close();
			await new Promise<void>((resolve) => io.close(() => resolve()));
			if (server.listening) {
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				);
			}
		}
	},
);
