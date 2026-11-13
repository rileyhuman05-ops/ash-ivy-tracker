import { clearSessionCookieHeader } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "set-cookie": clearSessionCookieHeader(),
      },
    }
  );
}
