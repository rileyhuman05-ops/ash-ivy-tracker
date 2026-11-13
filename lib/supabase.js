import { createClient } from "@supabase/supabase-js";

function readEnv(name) {
  return process.env[name];
}

/**
 * True when a string looks like a Supabase JWT (service_role or anon), not a URL/typo.
 * Rejects the common failure mode of pasting the project URL into the key secret.
 */
export function looksLikeSupabaseJwt(key) {
  const k = String(key || "").trim();
  if (k.length < 80) return false;
  if (/^https?:\/\//i.test(k)) return false;
  const parts = k.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Server-only Supabase admin client (service role). Never import from browser code.
 * Returns null when secrets are missing or clearly malformed (local smoke / bad secret paste).
 */
export function getSupabaseAdmin() {
  const url = String(readEnv("SUPABASE_URL") || "").trim().replace(/\/$/, "");
  const key = String(readEnv("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url || !key) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) return null;
  if (!looksLikeSupabaseJwt(key)) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseConfigured() {
  return Boolean(getSupabaseAdmin());
}

/** Human-readable reason when supabaseConfigured() is false. */
export function supabaseConfigMessage() {
  const url = String(readEnv("SUPABASE_URL") || "").trim();
  const key = String(readEnv("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url && !key) return "Supabase secrets not bound yet";
  if (!url) return "SUPABASE_URL is missing";
  if (!key) return "SUPABASE_SERVICE_ROLE_KEY is missing";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url.replace(/\/$/, ""))) {
    return "SUPABASE_URL looks wrong (need https://….supabase.co)";
  }
  if (!looksLikeSupabaseJwt(key)) {
    return "SUPABASE_SERVICE_ROLE_KEY is not a valid JWT (paste the service_role secret from Supabase → Project Settings → API)";
  }
  return "Supabase secrets not configured";
}
