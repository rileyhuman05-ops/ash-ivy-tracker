import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "bayline_warehouse_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function trimStr(value) {
  return String(value ?? "").trim();
}

export function isHostedRuntime() {
  // Cursor Apps / Vercel / generic production — never allow local placeholders.
  return Boolean(
    process.env.CURSOR_APP_ID ||
      process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.AWS_REGION ||
      process.env.NODE_ENV === "production"
  );
}

export function getConfiguredCredentials() {
  const username = trimStr(process.env.WAREHOUSE_USERNAME);
  const password = trimStr(process.env.WAREHOUSE_PASSWORD);

  if (username && password) {
    return { username, password, source: "env" };
  }

  // Local smoke only — never on hosted/production runtimes.
  if (!isHostedRuntime() && !username && !password) {
    return { username: "preview", password: "preview", source: "local-placeholder" };
  }

  return { username: "", password: "", source: "missing" };
}

export function credentialsConfigured() {
  return getConfiguredCredentials().source !== "missing";
}

/** Safe status for debugging — never includes secret values. */
export function authRuntimeStatus() {
  const configured = getConfiguredCredentials();
  return {
    configured: configured.source !== "missing",
    source: configured.source,
    hosted: isHostedRuntime(),
    hasUsernameEnv: Boolean(trimStr(process.env.WAREHOUSE_USERNAME)),
    hasPasswordEnv: Boolean(trimStr(process.env.WAREHOUSE_PASSWORD)),
  };
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyCredentials(rawUsername, rawPassword) {
  const username = trimStr(rawUsername);
  const password = trimStr(rawPassword);
  const configured = getConfiguredCredentials();
  if (configured.source === "missing") {
    return { ok: false, reason: "not_configured" };
  }
  const userOk = safeEqualString(username, configured.username);
  const passOk = safeEqualString(password, configured.password);
  if (userOk && passOk) return { ok: true, source: configured.source };
  return { ok: false, reason: "invalid" };
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
  const payload = `${trimStr(username)}|${exp}`;
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
  return safeEqualString(username, configured.username);
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
