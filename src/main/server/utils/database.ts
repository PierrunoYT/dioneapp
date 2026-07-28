/// <reference types="vite/client" />

import logger from "@/server/utils/logger";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

let supabase: SupabaseClient<any> | null = null;

try {
	if (
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
					persistSession: true,
					autoRefreshToken: true,
					detectSessionInUrl: false,
				},
			},
		);
	}
} catch (error) {
	logger.error("Failed to initialize supabase:", error);
}

export { supabase };
