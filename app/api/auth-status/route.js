import { authRuntimeStatus } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/** Returns whether warehouse secrets are present — never the values. */
export async function GET() {
  const status = authRuntimeStatus();
  return Response.json(status, {
    status: 200,
    headers: { "cache-control": "private, no-store" },
  });
}
