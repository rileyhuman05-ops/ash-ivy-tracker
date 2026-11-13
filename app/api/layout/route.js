import { requireIdentity } from "../../../cursor/identity.js";
import { loadLayout, saveLayout } from "../../../lib/layout-store.js";
import { supabaseConfigured } from "../../../lib/supabase.js";

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
      message: "Supabase secrets not bound yet",
    });
  }

  const result = await loadLayout(identity);
  if (!result.ok) {
    return json({ configured: true, error: result.error }, 500);
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

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const state = body?.state;
  const expectedRevision =
    body?.revision != null ? Number(body.revision) : null;

  const result = await saveLayout(identity, state, expectedRevision);
  if (!result.ok) {
    return json(
      {
        error: result.error,
        revision: result.revision ?? null,
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
