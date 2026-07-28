import assert from "node:assert/strict";
import { test } from "node:test";
import {
	prepareSafeReport,
	redactSensitiveData,
	sanitizeDiagnosticText,
} from "../src/main/utils/privacy";

test("diagnostic text redacts secrets, credentials, and local paths", () => {
	const sanitized = sanitizeDiagnosticText(
		"Authorization: Bearer abcdefghijklmnop\npassword=hunter2\n" +
			"OPENAI_API_KEY=openai-value\nclient_secret=client-value\n" +
			"https://alice:secret@example.com/api C:\\Users\\Alice\\file.txt /home/alice/file.txt",
		2_000,
	);
	assert.doesNotMatch(
		sanitized,
		/abcdefghijklmnop|hunter2|openai-value|client-value|alice:secret|Users\\Alice|home\/alice/,
	);
	assert.match(sanitized, /REDACTED_SECRET/);
	assert.match(sanitized, /REDACTED_CREDENTIALS/);
	assert.match(sanitized, /REDACTED_PATH/);
});

test("structured privacy redaction covers sensitive fields and bounds containers", () => {
	const redacted = redactSensitiveData({
		apiKey: "secret-value",
		nested: { message: "token=another-secret" },
		items: Array.from({ length: 40 }, (_, index) => index),
	}) as Record<string, any>;
	assert.equal(redacted.apiKey, "[REDACTED_SECRET]");
	assert.equal(redacted.nested.message, "token=[REDACTED_SECRET]");
	assert.equal(redacted.items.length, 32);
});

test("diagnostic truncation respects UTF-8 byte limits", () => {
	for (const limit of [12, 13, 61, 62, 63, 64]) {
		const sanitized = sanitizeDiagnosticText("🙂".repeat(100), limit);
		assert.ok(Buffer.byteLength(sanitized, "utf8") <= limit);
		assert.doesNotMatch(sanitized, /�/);
	}
	assert.match(sanitizeDiagnosticText("🙂".repeat(100), 63), /\[TRUNCATED\]$/);
});

test("secret markers are idempotent without allowing marker-prefix bypasses", () => {
	const once = sanitizeDiagnosticText("token=actual-secret", 2_000);
	assert.equal(sanitizeDiagnosticText(once, 2_000), once);
	assert.doesNotMatch(
		sanitizeDiagnosticText("token=[REDACTED_SECRET]actual-secret", 2_000),
		/actual-secret/,
	);
});

test("safe reports retain required fields while redacting their content", () => {
	assert.deepEqual(
		prepareSafeReport({
			type: "script",
			script: {
				appid: "example",
				details: "token=secret-value",
			},
		}),
		{
			type: "script",
			appid: "example",
			details: "token=[REDACTED_SECRET]",
		},
	);
});

test("safe reports reject invalid types and missing required fields", () => {
	assert.throws(() => prepareSafeReport(null), /object/);
	assert.throws(() => prepareSafeReport({ type: "unknown" }), /report type/);
	assert.throws(
		() => prepareSafeReport({ type: "error", details: "" }),
		/Invalid report field/,
	);
});
