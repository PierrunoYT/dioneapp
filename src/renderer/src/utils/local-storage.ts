type Validator<T> = (value: unknown) => value is T;

export function readStoredJson<T>(
	key: string,
	createDefault: () => T,
	isValid: Validator<T>,
): T {
	const stored = localStorage.getItem(key);
	if (stored === null) return createDefault();

	try {
		const parsed: unknown = JSON.parse(stored);
		if (isValid(parsed)) return parsed;
	} catch {
		// Invalid persisted state is discarded below.
	}

	localStorage.removeItem(key);
	return createDefault();
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export interface StoredConfig extends Record<string, unknown> {
	layoutMode?: "sidebar" | "topbar";
	sendAnonymousReports?: boolean;
	enableSuccessSound?: boolean;
	compactMode?: boolean;
}

export const isConfig = (value: unknown): value is StoredConfig =>
	isRecord(value) &&
	(value.layoutMode === undefined ||
		value.layoutMode === "sidebar" ||
		value.layoutMode === "topbar") &&
	(value.sendAnonymousReports === undefined ||
		typeof value.sendAnonymousReports === "boolean") &&
	(value.enableSuccessSound === undefined ||
		typeof value.enableSuccessSound === "boolean") &&
	(value.compactMode === undefined || typeof value.compactMode === "boolean");

export const isArray = (value: unknown): value is unknown[] =>
	Array.isArray(value);

export const isBoolean = (value: unknown): value is boolean =>
	typeof value === "boolean";

export const isArrayRecord = (
	value: unknown,
): value is Record<string, unknown[]> =>
	isRecord(value) && Object.values(value).every(Array.isArray);
