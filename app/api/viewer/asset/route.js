import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { requireIdentity } from "../../../../cursor/identity.js";
import { getSupabaseAdmin } from "../../../../lib/supabase.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLIM_RELATIVE = path.join("server-data", "warehouse-site-data.js");
const FULL_LOCAL_RELATIVE = path.join("server-data", "warehouse-site-data.full.js");
const APP_DIR = path.join("server-data", "app");
const SEED_ID = "bayline-mesa";
const APP_ID = "bayline-mesa";

function asDataScript(body) {
  const raw = String(body || "").trim();
  if (!raw) return null;
  if (raw.startsWith("window.DATA=")) return raw.endsWith(";") ? raw : raw + ";";
  return `window.DATA=${raw};`;
}

async function loadSeedScript() {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from("warehouse_seeds")
      .select("body")
      .eq("id", SEED_ID)
      .maybeSingle();
    if (!error && data && data.body != null) {
      const body = data.body;
      const ok =
        body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        body.site &&
        Array.isArray(body.runs) &&
        Array.isArray(body.types);
      if (ok) {
        const script = asDataScript(JSON.stringify(body));
        if (script) return script;
      }
    }
  }
  for (const rel of [FULL_LOCAL_RELATIVE, SLIM_RELATIVE]) {
    try {
      const text = await readFile(path.join(process.cwd(), rel), "utf8");
      const script = asDataScript(text);
      if (script) return script;
    } catch {}
  }
  return null;
}

async function loadAppScript() {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin
      .from("warehouse_app_scripts")
      .select("body")
      .eq("id", APP_ID)
      .maybeSingle();
    if (!error && data && typeof data.body === "string" && data.body.length > 1000) {
      return data.body;
    }
  }
  try {
    const dir = path.join(process.cwd(), APP_DIR);
    const names = (await readdir(dir)).filter((n) => /^\d{2}-.*\.js$/.test(n)).sort();
    if (!names.length) return null;
    const parts = await Promise.all(names.map((n) => readFile(path.join(dir, n), "utf8")));
    return parts.join("");
  } catch {
    return null;
  }
}

export async function GET(request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const name = new URL(request.url).searchParams.get("name");
  let body = null;
  if (name === "data") body = await loadSeedScript();
  else if (name === "app") body = await loadAppScript();
  else {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
    });
  }
  if (!body) {
    return new Response("Asset missing on server", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
    });
  }
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "private, max-age=60",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
