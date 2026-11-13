import { createClient } from "@supabase/supabase-js";

function readEnv(name) {
  return process.env[name];
}

/**
 * Server-only Supabase admin client (service role). Never import from browser code.
 * Returns null when secrets are not configured (local smoke without persistence).
 */
export function getSupabaseAdmin() {
  const url = String(readEnv("SUPABASE_URL") || "").trim();
  const key = String(readEnv("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseConfigured() {
  return Boolean(getSupabaseAdmin());
}
