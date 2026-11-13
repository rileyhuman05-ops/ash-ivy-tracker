import {
  authRuntimeStatus,
  createSessionToken,
  sessionCookieHeader,
  verifyCredentials,
} from "../../../lib/auth";
import { allowLoginAttempt } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";

function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function wantSecureCookie(request) {
  try {
    const url = new URL(request.url);
    if (url.protocol === "https:") return true;
  } catch {
    /* ignore */
  }
  return request.headers.get("x-forwarded-proto") === "https";
}

export async function POST(request) {
  const limit = allowLoginAttempt(clientKey(request));
  if (!limit.ok) {
    return Response.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      {
        status: 429,
        headers: {
          "cache-control": "private, no-store",
          "retry-after": String(limit.retryAfterSec || 60),
        },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");
  const result = verifyCredentials(username, password);
  const status = authRuntimeStatus();

  if (!result.ok) {
    const message =
      result.reason === "not_configured"
        ? "Server credentials are not configured"
        : !result.usernameMatched
          ? "Username does not match the saved secret"
          : "Password does not match the saved secret";
    return Response.json(
      {
        error: message,
        reason: result.reason,
        usernameMatched: Boolean(result.usernameMatched),
        passwordMatched: Boolean(result.passwordMatched),
        // Safe booleans/lengths only — never secret values
        status,
      },
      {
        status: 401,
        headers: { "cache-control": "private, no-store" },
      }
    );
  }

  const token = createSessionToken(username);
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "set-cookie": sessionCookieHeader(token, {
          secure: wantSecureCookie(request),
        }),
      },
    }
  );
}
