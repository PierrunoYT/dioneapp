/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_PUBLIC_ACCOUNTS_ENABLED?: "true" | "false";
	readonly VITE_PUBLIC_DATABASE_ENABLED?: "true" | "false";
	readonly VITE_PUBLIC_CATALOG_API_ENABLED?: "true" | "false";
	readonly VITE_PUBLIC_SUPABASE_URL?: string;
	readonly VITE_PUBLIC_SUPABASE_ANON_KEY?: string;
	readonly VITE_PUBLIC_REMOTE_INSTALLS_ENABLED?: "true" | "false";
	readonly VITE_PUBLIC_DIONE_CATALOG_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
