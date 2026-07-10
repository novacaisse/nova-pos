import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// External Supabase project (hardcoded — publishable values are safe in the browser).
export const SUPABASE_URL = "https://iwpxafuoxixjhioyuhdm.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_sWTjlxYuOrOmGnTAc_Mvig_wQLkygiu";

// Loose typing: this project uses an EXTERNAL Supabase instance, so we can't
// auto-generate types. Extend a Database type here later if you run
// `supabase gen types typescript` locally against your own project.
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "novacaisse-auth",
  },
});
