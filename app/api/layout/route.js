import { requireIdentity } from "../../../cursor/identity.js";
import {
  MAX_LAYOUT_BYTES,
  validateLayoutState,
} from "../../../lib/layout-limits.js";
import { loadLayout, saveLayout } from "../../../lib/layout-store.js";
import {
  supabaseConfigured,
  supabaseConfigMessage,
} from "../../../lib/supabase.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = {
  "cache-control": "private, no-store",
  "content-type": "application/json; charset=utf-8",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

/**
 * GET — load shared warehouse layout for this Cursor Private viewer.
 * PUT — save layout JSON (racks, areas, equip, conts, types, skus, cfg).
 */
export async function GET(request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  if (!supabaseConfigured()) {
    return json({
      configured: false,
      state: null,
      message: supabaseConfigMessage(),
    });
  }

  const result = await loadLayout(identity);
  if (!result.ok) {
    const badKey = result.error === "supabase_invalid_api_key";
    return json(
      {
        configured: !badKey,
        error: result.error,
        message: badKey
          ? "SUPABASE_SERVICE_ROLE_KEY was rejected by Supabase — update the service_role secret in Cursor Secrets"
          : result.error,
      },
      badKey ? 503 : 500
    );
  }
  if (!result.row) {
    return json({
      configured: true,
      state: null,
      revision: 0,
      updatedAt: null,
    });
  }

  return json({
    configured: true,
    state: result.row.state,
    revision: result.row.revision,
    updatedAt: result.row.updated_at,
    updatedBy: {
      name: result.row.updated_by_name,
      email: result.row.updated_by_email,
    },
  });
}

export async function PUT(request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const declared = request.headers.get("content-length");
  if (declared != null && Number(declared) > MAX_LAYOUT_BYTES) {
    return json(
      { error: "payload_too_large", maxBytes: MAX_LAYOUT_BYTES },
      413
    );
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_LAYOUT_BYTES) {
    return json(
      { error: "payload_too_large", maxBytes: MAX_LAYOUT_BYTES },
      413
    );
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const state = body?.state;
  const expectedRevision =
    body?.revision != null ? Number(body.revision) : null;

  const check = validateLayoutState(state);
  if (!check.ok) {
    return json({ error: check.error }, 400);
  }

  const result = await saveLayout(identity, state, expectedRevision);
  if (!result.ok) {
    const badKey = result.error === "supabase_invalid_api_key";
    return json(
      {
        error: result.error,
        revision: result.revision ?? null,
        message: badKey
          ? "SUPABASE_SERVICE_ROLE_KEY was rejected by Supabase — update the service_role secret in Cursor Secrets"
          : undefined,
      },
      result.status || 500
    );
  }

  return json({
    ok: true,
    revision: result.row.revision,
    updatedAt: result.row.updated_at,
    updatedBy: {
      name: result.row.updated_by_name,
      email: result.row.updated_by_email,
    },
  });
}
