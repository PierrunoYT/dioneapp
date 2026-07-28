const APP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const sanitizeWhitespace = (name: string) => name.trim().replace(/\s+/g, "-");

export const validateAppId = (value: string) => {
	const appId = sanitizeWhitespace(value);
	if (!APP_ID_PATTERN.test(appId) || appId === "." || appId === "..") {
		throw new Error("Invalid application identifier");
	}
	return appId;
};

export const sanitizeScriptName = (name: string) => validateAppId(name);
