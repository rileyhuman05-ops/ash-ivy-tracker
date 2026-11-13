/** Max JSON body for PUT /api/layout (bytes). */
export const MAX_LAYOUT_BYTES = 1_500_000; // ~1.5 MB

/** Max nesting depth for parsed layout JSON. */
export const MAX_LAYOUT_DEPTH = 12;

/** Soft caps on top-level collection sizes. */
export const MAX_COLLECTION = 5_000;

/**
 * @param {unknown} value
 * @param {number} depth
 * @returns {number}
 */
export function jsonDepth(value, depth = 1) {
  if (value === null || typeof value !== "object") return depth;
  let max = depth;
  if (Array.isArray(value)) {
    for (const item of value) {
      max = Math.max(max, jsonDepth(item, depth + 1));
      if (max > MAX_LAYOUT_DEPTH) return max;
    }
    return max;
  }
  for (const key of Object.keys(value)) {
    max = Math.max(max, jsonDepth(value[key], depth + 1));
    if (max > MAX_LAYOUT_DEPTH) return max;
  }
  return max;
}

/**
 * Validate layout state shape and size after parse.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateLayoutState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { ok: false, error: "invalid_state" };
  }
  if (!Array.isArray(state.runs) || !Array.isArray(state.types)) {
    return { ok: false, error: "invalid_state" };
  }

  const collections = [
    ["runs", state.runs],
    ["types", state.types],
    ["areas", state.areas],
    ["equip", state.equip],
    ["conts", state.conts],
  ];
  for (const [name, list] of collections) {
    if (list != null && !Array.isArray(list)) {
      return { ok: false, error: `invalid_${name}` };
    }
    if (Array.isArray(list) && list.length > MAX_COLLECTION) {
      return { ok: false, error: `${name}_too_large` };
    }
  }

  if (state.skus != null && (typeof state.skus !== "object" || Array.isArray(state.skus))) {
    return { ok: false, error: "invalid_skus" };
  }
  if (state.skus && Object.keys(state.skus).length > MAX_COLLECTION) {
    return { ok: false, error: "skus_too_large" };
  }

  if (jsonDepth(state) > MAX_LAYOUT_DEPTH) {
    return { ok: false, error: "state_too_deep" };
  }

  return { ok: true };
}
