import { apiFetch } from "@/utils/api";

const cooldown = 1 * 60 * 1000;
let lastReportAt: number | null = null;

interface ReportPreview {
	report: Record<string, string>;
}

export async function sendReportWithConsent(
	report: Record<string, unknown>,
): Promise<"reported" | "canceled" | "error"> {
	try {
		const previewResponse = await apiFetch("/report/preview", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(report),
		});
		if (!previewResponse.ok) return "error";

		const preview = (await previewResponse.json()) as ReportPreview;
		const approved = window.confirm(
			`Review the complete redacted report below. It will be sent to Dione's report database only if you choose OK. Secrets, credentials, sensitive paths, and stable device identifiers are not included.\n\n${JSON.stringify(preview.report, null, 2)}`,
		);
		if (!approved) return "canceled";

		const response = await apiFetch("/report", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...preview.report, consent: true }),
		});
		return response.ok ? "reported" : "error";
	} catch {
		return "error";
	}
}

export async function sendDiscordReport(
	error: Error | string,
	additionalInfo?: Record<string, any>,
) {
	if (import.meta.env.DEV) return "dev-mode";
	if (lastReportAt && Date.now() - lastReportAt < cooldown) {
		return "error";
	}

	try {
		const isUserReport = Boolean(
			additionalInfo?.UserReport || additionalInfo?.userReport,
		);
		const details = isUserReport
			? String(additionalInfo?.UserDescription ?? error)
			: JSON.stringify({
					message: error instanceof Error ? error.message : error,
					stack: error instanceof Error ? error.stack : undefined,
				});
		const sent = await sendReportWithConsent({
			type: isUserReport ? "user" : "error",
			details,
		});
		if (sent === "reported") lastReportAt = Date.now();
		return sent;
	} catch {
		return "error";
	}
}
