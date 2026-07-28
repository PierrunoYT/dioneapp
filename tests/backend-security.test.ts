import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import {
	consumeSocketTicket,
	createSocketTicket,
	getBackendToken,
	isValidBackendToken,
	requireBackendAuth,
} from "../src/main/server/security";

function runAuth(authorization?: string) {
	let status: number | undefined;
	let payload: unknown;
	let nextCalled = false;
	const req = {
		get: (name: string) =>
			name === "authorization" ? authorization : undefined,
	} as Request;
	const res = {
		status: (value: number) => {
			status = value;
			return res;
		},
		json: (value: unknown) => {
			payload = value;
			return res;
		},
	} as unknown as Response;
	requireBackendAuth(req, res, (() => {
		nextCalled = true;
	}) as NextFunction);
	return { status, payload, nextCalled };
}

test("backend token validation rejects malformed and incorrect credentials", () => {
	assert.equal(isValidBackendToken(undefined), false);
	assert.equal(isValidBackendToken("short"), false);
	assert.equal(isValidBackendToken(`${getBackendToken()}x`), false);
});

test("backend auth middleware rejects missing and malformed bearer headers", () => {
	for (const header of [undefined, "Basic abc", "Bearer", "Bearer invalid!"]) {
		assert.deepEqual(runAuth(header), {
			status: 401,
			payload: { error: "Unauthorized" },
			nextCalled: false,
		});
	}
});

test("backend auth middleware accepts only the process-local bearer token", () => {
	assert.deepEqual(runAuth(`Bearer ${getBackendToken()}`), {
		status: undefined,
		payload: undefined,
		nextCalled: true,
	});
});

test("socket tickets are scoped to an application and single use", () => {
	const wrongAppTicket = createSocketTicket("app-one");
	assert.equal(consumeSocketTicket(wrongAppTicket, "app-two"), false);
	assert.equal(consumeSocketTicket(wrongAppTicket, "app-one"), false);

	const validTicket = createSocketTicket("app-one");
	assert.equal(consumeSocketTicket(validTicket, "app-one"), true);
	assert.equal(consumeSocketTicket(validTicket, "app-one"), false);
});
