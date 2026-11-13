import {
  createSessionToken,
  sessionCookieHeader,
  verifyCredentials,
} from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = String(body?.username ?? "");
  const password = String(body?.password ?? "");
  const result = verifyCredentials(username, password);

  if (!result.ok) {
    const message =
      result.reason === "not_configured"
        ? "Server credentials are not configured"
        : "Invalid username or password";
    return Response.json(
      { error: message },
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
        "set-cookie": sessionCookieHeader(token),
      },
    }
  );
}
