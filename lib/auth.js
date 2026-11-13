import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "bayline_warehouse_session";
const EXPECTED_USERNAME = "Riley.Human";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

/**
 * Read env by dynamic key so Next.js cannot inline/replace the value at build time
 * (build-time empty/wrong values were a likely cause of live login mismatch).
 */
function readEnv(name) {
  return process.env[name];
}

/** Strip BOM, zero-width chars, wrapping quotes; NFC + trim. Never log the result. */
export function normalizeSecret(value) {
  let s = String(value ?? "");
  // UTF-8 BOM and common zero-widths
  s = s.replace(/^\uFEFF/, "");
  s = s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  s = s.normalize("NFC");
  s = s.trim();
  // Secrets UI users sometimes paste "value" or 'value'
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function inspectRawEnv(name) {
  const raw = readEnv(name);
  const present = raw !== undefined && raw !== null && String(raw).length > 0;
  const asString = present ? String(raw) : "";
  const withoutBom = asString.replace(/^\uFEFF/, "").trim();
  return {
    present,
    rawLength: asString.length,
    hasBom: asString.charCodeAt(0) === 0xfeff,
    hasWrappingQuotes:
      (withoutBom.startsWith('"') && withoutBom.endsWith('"')) ||
      (withoutBom.startsWith("'") && withoutBom.endsWith("'")),
  };
}

export function isHostedRuntime() {
  return Boolean(
    readEnv("CURSOR_APP_ID") ||
      readEnv("VERCEL") ||
      readEnv("VERCEL_ENV") ||
      readEnv("AWS_REGION") ||
      readEnv("NODE_ENV") === "production"
  );
}

export function getConfiguredCredentials() {
  const username = normalizeSecret(readEnv("WAREHOUSE_USERNAME"));
  const password = normalizeSecret(readEnv("WAREHOUSE_PASSWORD"));

  if (username && password) {
    return { username, password, source: "env" };
  }

  if (!isHostedRuntime() && !username && !password) {
    return {
      username: "preview",
      password: "preview",
      source: "local-placeholder",
    };
  }

  return { username: "", password: "", source: "missing" };
}

export function credentialsConfigured() {
  return getConfiguredCredentials().source !== "missing";
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function usernamesMatch(a, b) {
  // Username is case-insensitive; password stays exact after normalize.
  return safeEqualString(a.toLowerCase(), b.toLowerCase());
}

/** Safe status for debugging — never includes secret values. */
export function authRuntimeStatus() {
  const configured = getConfiguredCredentials();
  const userMeta = inspectRawEnv("WAREHOUSE_USERNAME");
  const passMeta = inspectRawEnv("WAREHOUSE_PASSWORD");
  return {
    configured: configured.source !== "missing",
    source: configured.source,
    hosted: isHostedRuntime(),
    hasUsernameEnv: userMeta.present,
    hasPasswordEnv: passMeta.present,
    usernameRawLength: userMeta.rawLength,
    passwordRawLength: passMeta.rawLength,
    usernameNormalizedLength: configured.username.length,
    passwordNormalizedLength: configured.password.length,
    usernameHasBom: userMeta.hasBom,
    passwordHasBom: passMeta.hasBom,
    usernameHadWrappingQuotes: userMeta.hasWrappingQuotes,
    passwordHadWrappingQuotes: passMeta.hasWrappingQuotes,
    usernameMatchesExpected: configured.username
      ? usernamesMatch(configured.username, EXPECTED_USERNAME)
      : false,
    expectedUsername: EXPECTED_USERNAME,
  };
}

export function verifyCredentials(rawUsername, rawPassword) {
  const username = normalizeSecret(rawUsername);
  const password = normalizeSecret(rawPassword);
  const configured = getConfiguredCredentials();
  if (configured.source === "missing") {
    return {
      ok: false,
      reason: "not_configured",
      usernameMatched: false,
      passwordMatched: false,
    };
  }
  const userOk = usernamesMatch(username, configured.username);
  const passOk = safeEqualString(password, configured.password);
  if (userOk && passOk) {
    return { ok: true, source: configured.source, usernameMatched: true, passwordMatched: true };
  }
  return {
    ok: false,
    reason: "invalid",
    usernameMatched: userOk,
    passwordMatched: passOk,
  };
}

function signingKey() {
  const { password, username, source } = getConfiguredCredentials();
  return `${source}:${username}:${password}:bayline-warehouse-v1`;
}

function signPayload(payload) {
  return createHmac("sha256", signingKey()).update(payload).digest("hex");
}

export function createSessionToken(username) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${normalizeSecret(username)}|${exp}`;
  return `${payload}|${signPayload(payload)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split("|");
  if (parts.length !== 3) return false;
  const [username, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!username || !Number.isFinite(exp) || exp < Date.now()) return false;
  const payload = `${username}|${exp}`;
  const expected = signPayload(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const configured = getConfiguredCredentials();
  if (configured.source === "missing") return false;
  return usernamesMatch(username, configured.username);
}

export function readSessionFromRequest(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  try {
    return verifySessionToken(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
}

export function sessionCookieHeader(token, { secure } = {}) {
  const useSecure = secure ?? isHostedRuntime();
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (useSecure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader({ secure } = {}) {
  const useSecure = secure ?? isHostedRuntime();
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (useSecure) parts.push("Secure");
  return parts.join("; ");
}
