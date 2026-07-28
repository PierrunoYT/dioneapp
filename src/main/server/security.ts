import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const backendToken = randomBytes(32).toString("base64url");
const socketTickets = new Map<
	string,
	{ appId: string; expiresAt: number }
>();

export function getBackendToken(): string {
	return backendToken;
}

export function isValidBackendToken(value: unknown): boolean {
	if (typeof value !== "string") return false;
	const supplied = Buffer.from(value);
	const expected = Buffer.from(backendToken);
	return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createSocketTicket(appId: string): string {
	const now = Date.now();
	for (const [value, ticket] of socketTickets) {
		if (ticket.expiresAt < now) socketTickets.delete(value);
	}
	const ticket = randomBytes(32).toString("base64url");
	socketTickets.set(ticket, { appId, expiresAt: now + 60_000 });
	return ticket;
}

export function consumeSocketTicket(value: unknown, appId: string): boolean {
	if (typeof value !== "string") return false;
	const ticket = socketTickets.get(value);
	socketTickets.delete(value);
	return Boolean(ticket && ticket.expiresAt >= Date.now() && ticket.appId === appId);
}

export function requireBackendAuth(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const authorization = req.get("authorization");
	const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
	if (!isValidBackendToken(token)) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}
	next();
}
