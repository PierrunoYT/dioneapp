/// <reference types="vite/client" />

// Feature switches for the account, login, and database-backed surfaces.
//
// Both default to disabled. Dione ships without user accounts, and the
// Supabase-backed features degrade to API-only or local behaviour rather than
// failing, so a build with no configuration behaves like a build with the
// features deliberately turned off.
function isEnabled(value: string | undefined): boolean {
	return value === "true";
}

// Gates the login screen, account UI, and the deep-link auth/refresh token
// handover. Nothing in the app signs in while this is false.
export const accountsEnabled = isEnabled(
	import.meta.env.VITE_PUBLIC_ACCOUNTS_ENABLED,
);

// Gates the Supabase client. While false, tag-filtered search falls back to the
// Dione catalog API, report submission is refused up front, and shared tunnel
// URLs are returned unshortened.
export const databaseEnabled = isEnabled(
	import.meta.env.VITE_PUBLIC_DATABASE_ENABLED,
);
