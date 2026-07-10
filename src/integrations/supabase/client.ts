import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// External Supabase project (hardcoded — publishable values are safe in the browser).
export const SUPABASE_URL = "https://iwpxafuoxixjhioyuhdm.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_sWTjlxYuOrOmGnTAc_Mvig_wQLkygiu";

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: "novacaisse-auth",
    },
  },
);
