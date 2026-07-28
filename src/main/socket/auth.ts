import { sanitizeScriptName } from "../server/scripts/utils/app-id";
import { consumeSocketTicket } from "../server/security";

interface SocketAuthentication {
	handshake: { auth?: Record<string, unknown> };
	data: Record<string, unknown>;
}

export function authenticateSocket(
	socket: SocketAuthentication,
	next: (error?: Error) => void,
	now: () => number = Date.now,
): void {
	try {
		const appId = sanitizeScriptName(socket.handshake.auth?.appId as string);
		if (!consumeSocketTicket(socket.handshake.auth?.ticket, appId, now())) {
			throw new Error("Unauthorized");
		}
		socket.data.appId = appId;
		next();
	} catch {
		next(new Error("Unauthorized"));
	}
}
