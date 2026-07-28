import { sendReportWithConsent } from "./discord-webhook";

export const reportBadContent = async (
	type: "script" | "ai",
	script?: Record<string, any>,
	ai?: Record<string, any>,
) => {
	const reported = await sendReportWithConsent({
		type,
		script,
		ai,
	});
	return reported;
};
