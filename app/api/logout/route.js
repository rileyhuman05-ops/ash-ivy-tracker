import { clearSessionCookieHeader } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let secure = false;
  try {
    secure = new URL(request.url).protocol === "https:";
  } catch {
    secure = request.headers.get("x-forwarded-proto") === "https";
  }
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "set-cookie": clearSessionCookieHeader({ secure }),
      },
    }
  );
}
