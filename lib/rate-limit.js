// Simple in-memory limiter for /api/login (per instance).
const buckets = new Map();

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 20;

export function allowLoginAttempt(key) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    entry = { start: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.ceil((entry.start + WINDOW_MS - now) / 1000) };
  }
  return { ok: true };
}
