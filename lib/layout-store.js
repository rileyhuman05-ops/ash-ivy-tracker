import { getSupabaseAdmin } from "./supabase.js";

const TABLE = "warehouse_layouts";

/** Shared layout document id. Preview hosts use a separate row. */
export function layoutDocumentId(identity) {
  const stage = identity?.stage === "preview" ? "preview" : "production";
  return stage === "preview" ? "bayline-mesa-preview" : "bayline-mesa";
}

function actorFields(identity) {
  return {
    updated_by_sub: identity?.sub || null,
    updated_by_name: identity?.name || null,
    updated_by_email: identity?.email || null,
  };
}

/**
 * @returns {Promise<{ ok: true, missing?: true, configured: false } | { ok: true, configured: true, row: object | null } | { ok: false, error: string }>}
 */
export async function loadLayout(identity) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: true, configured: false, row: null };
  }

  const id = layoutDocumentId(identity);
  const { data, error } = await admin
    .from(TABLE)
    .select("id, state, revision, updated_at, updated_by_sub, updated_by_name, updated_by_email")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, configured: true, row: data };
}

/**
 * Upserts the shared layout JSON for this host stage.
 * @param {object} identity
 * @param {object} state — parsed getState() payload
 * @param {number|null} expectedRevision — optional optimistic concurrency
 */
export async function saveLayout(identity, state, expectedRevision = null) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "supabase_not_configured", status: 503 };
  }

  if (!state || typeof state !== "object" || !Array.isArray(state.runs) || !Array.isArray(state.types)) {
    return { ok: false, error: "invalid_state", status: 400 };
  }

  const id = layoutDocumentId(identity);
  const existing = await admin
    .from(TABLE)
    .select("revision")
    .eq("id", id)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: existing.error.message, status: 500 };
  }

  const currentRev = existing.data?.revision ?? 0;
  if (
    expectedRevision != null &&
    Number.isFinite(Number(expectedRevision)) &&
    Number(expectedRevision) !== Number(currentRev)
  ) {
    return {
      ok: false,
      error: "revision_conflict",
      status: 409,
      revision: currentRev,
    };
  }

  const nextRev = currentRev + 1;
  const payload = {
    id,
    state,
    revision: nextRev,
    updated_at: new Date().toISOString(),
    ...actorFields(identity),
  };

  const { data, error } = await admin
    .from(TABLE)
    .upsert(payload, { onConflict: "id" })
    .select("id, revision, updated_at, updated_by_sub, updated_by_name, updated_by_email")
    .single();

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true, row: data };
}
