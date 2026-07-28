/// <reference types="vite/client" />

import { databaseEnabled } from "@/server/utils/features";
import logger from "@/server/utils/logger";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

let supabase: SupabaseClient<any> | null = null;

try {
	if (!databaseEnabled) {
		logger.info(
			"Database-backed features are disabled. Set VITE_PUBLIC_DATABASE_ENABLED=true to enable them.",
		);
	} else if (
		!import.meta.env.VITE_PUBLIC_SUPABASE_URL ||
		!import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY
	) {
		logger.warn(
			"Supabase not initialized. Set the public Supabase URL and anonymous key to enable database-backed features.",
		);
	} else {
		supabase = createClient<any>(
			import.meta.env.VITE_PUBLIC_SUPABASE_URL,
			import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY,
			{
				auth: {
					// Dione has no user accounts, so nothing ever signs in and there is
					// no session to persist or refresh. The anonymous key is the only
					// credential used, and access is enforced with RLS.
					persistSession: false,
					autoRefreshToken: false,
					detectSessionInUrl: false,
				},
			},
		);
	}
} catch (error) {
	logger.error("Failed to initialize supabase:", error);
}

export { supabase };
