import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireIdentity } from "../../../cursor/identity.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-only path — not under public/; blocked by middleware if requested as a URL. */
const MODEL_RELATIVE = path.join(
  "server-data",
  "warehouse-site-preview-v3.html"
);

/**
 * Access control: Cursor Private app identity only (no warehouse password).
 * Owner accepted that anyone who can open this Private app may view the model.
 */
export async function GET(request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) {
    return identity;
  }

  const filePath = path.join(process.cwd(), MODEL_RELATIVE);
  let html;
  try {
    html = await readFile(filePath, "utf8");
  } catch {
    return new Response("Warehouse model file missing on server", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  html = html.replace(
    /<title>Bayline Mesa Warehouse — site model preview v2<\/title>/,
    "<title>Bayline Mesa Warehouse — site model preview v3</title>"
  );

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
