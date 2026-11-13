import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireIdentity } from "../../../../cursor/identity.js";
import { getSupabaseAdmin } from "../../../../lib/supabase.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLIM_RELATIVE = path.join("server-data", "warehouse-site-data.js");
const FULL_LOCAL_RELATIVE = path.join(
  "server-data",
  "warehouse-site-data.full.js"
);
const SEED_ID = "bayline-mesa";

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

  // Local-only full seed (gitignored) for dev; slim committed fallback for publish.
  for (const rel of [FULL_LOCAL_RELATIVE, SLIM_RELATIVE]) {
    try {
      const text = await readFile(path.join(process.cwd(), rel), "utf8");
      const script = asDataScript(text);
      if (script) return script;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Identity-gated seed DATA for the warehouse HTML.
 * Three.js loads from jsDelivr CDN (not shipped). Seed prefers Supabase
 * warehouse_seeds, then local full/slim files.
 */
export async function GET(request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) {
    return identity;
  }

  const name = new URL(request.url).searchParams.get("name");
  if (name !== "data") {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  const body = await loadSeedScript();
  if (!body) {
    return new Response("Seed data missing on server", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
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
