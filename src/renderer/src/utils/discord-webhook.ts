import { apiFetch } from "@/utils/api";

const cooldown = 1 * 60 * 1000;
let lastReportAt: number | null = null;

export async function sendDiscordReport(
	error: Error | string,
	additionalInfo?: Record<string, any>,
) {
	if (import.meta.env.DEV) return "dev-mode";
	if (lastReportAt && Date.now() - lastReportAt < cooldown) {
		return false;
	}

	lastReportAt = Date.now();

	try {
		const details = JSON.stringify({
			message: error instanceof Error ? error.message : error,
			stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined,
			additionalInfo,
		}).slice(0, 16_000);
		const response = await apiFetch("/report", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				type:
					additionalInfo?.UserReport || additionalInfo?.userReport
						? "user"
						: "error",
				details,
			}),
		});
		return response.ok;
	} catch {
		return false;
	}
}
