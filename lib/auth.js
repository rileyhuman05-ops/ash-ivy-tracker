import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "bayline_warehouse_session";
export const PRIMARY_USERNAME = "Riley.Human";
export const SECOND_USERNAME = "Nexstar2026";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

/**
 * Read env by dynamic key so Next.js cannot inline/replace the value at build time.
 */
function readEnv(name) {
  return process.env[name];
}

/** Strip BOM, zero-width chars, wrapping quotes; NFC + trim. Never log the result. */
export function normalizeSecret(value) {
  let s = String(value ?? "");
  s = s.replace(/^\uFEFF/, "");
  s = s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  s = s.normalize("NFC");
  s = s.trim();
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

function pairFromEnv(userKey, passKey) {
  const username = normalizeSecret(readEnv(userKey));
  const password = normalizeSecret(readEnv(passKey));
  if (username && password) return { username, password };
  return null;
}

/**
 * All valid login pairs. Keeps primary WAREHOUSE_USERNAME/PASSWORD and optional
 * WAREHOUSE_USERNAME_2/PASSWORD_2. Optional WAREHOUSE_USERS JSON:
 * [{"username":"...","password":"..."}]
 */
export function listCredentialPairs() {
  const pairs = [];
  const seen = new Set();

  function add(pair) {
    if (!pair?.username || !pair?.password) return;
    const key = pair.username.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push(pair);
  }

  add(pairFromEnv("WAREHOUSE_USERNAME", "WAREHOUSE_PASSWORD"));

  // Second account: prefer explicit USERNAME_2; if only PASSWORD_2 is set, use Nexstar2026.
  const secondExplicit = pairFromEnv("WAREHOUSE_USERNAME_2", "WAREHOUSE_PASSWORD_2");
  if (secondExplicit) {
    add(secondExplicit);
  } else {
    const pass2 = normalizeSecret(readEnv("WAREHOUSE_PASSWORD_2"));
    if (pass2) add({ username: SECOND_USERNAME, password: pass2 });
  }

  const usersJson = normalizeSecret(readEnv("WAREHOUSE_USERS"));
  if (usersJson) {
    try {
      const parsed = JSON.parse(usersJson);
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          add({
            username: normalizeSecret(row?.username),
            password: normalizeSecret(row?.password),
          });
        }
      }
    } catch {
      // Ignore malformed JSON — other pairs still work.
    }
  }

  if (pairs.length === 0 && !isHostedRuntime()) {
    return [
      {
        username: "preview",
        password: "preview",
        source: "local-placeholder",
      },
    ];
  }

  return pairs.map((p) => ({ ...p, source: "env" }));
}

/** @deprecated use listCredentialPairs — kept for page.js compatibility */
export function getConfiguredCredentials() {
  const pairs = listCredentialPairs();
  if (pairs.length === 0) {
    return { username: "", password: "", source: "missing" };
  }
  const first = pairs[0];
  return {
    username: first.username,
    password: first.password,
    source: first.source === "local-placeholder" ? "local-placeholder" : "env",
  };
}

export function credentialsConfigured() {
  return listCredentialPairs().length > 0;
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function usernamesMatch(a, b) {
  return safeEqualString(a.toLowerCase(), b.toLowerCase());
}

/** Safe status for debugging — never includes secret values. */
export function authRuntimeStatus() {
  const pairs = listCredentialPairs();
  const primaryUser = inspectRawEnv("WAREHOUSE_USERNAME");
  const primaryPass = inspectRawEnv("WAREHOUSE_PASSWORD");
  const secondUser = inspectRawEnv("WAREHOUSE_USERNAME_2");
  const secondPass = inspectRawEnv("WAREHOUSE_PASSWORD_2");
  const hasPrimary =
    pairs.some((p) => usernamesMatch(p.username, PRIMARY_USERNAME)) ||
    (primaryUser.present && primaryPass.present);
  const hasSecondSlot = secondUser.present || secondPass.present;
  const secondConfigured = pairs.some((p) =>
    usernamesMatch(p.username, SECOND_USERNAME)
  );

  return {
    configured: pairs.length > 0,
    source: pairs[0]?.source === "local-placeholder" ? "local-placeholder" : pairs.length ? "env" : "missing",
    hosted: isHostedRuntime(),
    userCount: pairs.length,
    hasUsernameEnv: primaryUser.present,
    hasPasswordEnv: primaryPass.present,
    hasUsername2Env: secondUser.present,
    hasPassword2Env: secondPass.present,
    primarySlotComplete: primaryUser.present && primaryPass.present,
    secondSlotComplete: secondUser.present && secondPass.present,
    secondSlotPartial: hasSecondSlot && !(secondUser.present && secondPass.present),
    usernameMatchesExpected: pairs.some((p) =>
      usernamesMatch(p.username, PRIMARY_USERNAME)
    ),
    secondUsernameConfigured: secondConfigured,
    expectedUsernames: [PRIMARY_USERNAME, SECOND_USERNAME],
    // Keep lengths only for primary slot (debug); never values
    usernameNormalizedLength: normalizeSecret(readEnv("WAREHOUSE_USERNAME")).length,
    passwordNormalizedLength: normalizeSecret(readEnv("WAREHOUSE_PASSWORD")).length,
    username2NormalizedLength: normalizeSecret(readEnv("WAREHOUSE_USERNAME_2")).length,
    password2NormalizedLength: normalizeSecret(readEnv("WAREHOUSE_PASSWORD_2")).length,
    usernameHasBom: primaryUser.hasBom || secondUser.hasBom,
    passwordHasBom: primaryPass.hasBom || secondPass.hasBom,
    usernameHadWrappingQuotes:
      primaryUser.hasWrappingQuotes || secondUser.hasWrappingQuotes,
    passwordHadWrappingQuotes:
      primaryPass.hasWrappingQuotes || secondPass.hasWrappingQuotes,
    hasPrimaryAccountHint: hasPrimary,
  };
}

export function verifyCredentials(rawUsername, rawPassword) {
  const username = normalizeSecret(rawUsername);
  const password = normalizeSecret(rawPassword);
  const pairs = listCredentialPairs();
  if (pairs.length === 0) {
    return {
      ok: false,
      reason: "not_configured",
      usernameMatched: false,
      passwordMatched: false,
    };
  }

  let usernameMatched = false;
  for (const pair of pairs) {
    if (!usernamesMatch(username, pair.username)) continue;
    usernameMatched = true;
    if (safeEqualString(password, pair.password)) {
      return {
        ok: true,
        source: pair.source === "local-placeholder" ? "local-placeholder" : "env",
        usernameMatched: true,
        passwordMatched: true,
      };
    }
  }

  return {
    ok: false,
    reason: "invalid",
    usernameMatched,
    passwordMatched: false,
  };
}

function signingKey() {
  const pairs = listCredentialPairs();
  const material = pairs
    .map((p) => `${p.username.toLowerCase()}:${p.password}`)
    .sort()
    .join("|");
  const source = pairs[0]?.source === "local-placeholder" ? "local-placeholder" : "env";
  return `${source}:${material}:bayline-warehouse-v1`;
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
  const pairs = listCredentialPairs();
  if (pairs.length === 0) return false;
  return pairs.some((p) => usernamesMatch(username, p.username));
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
