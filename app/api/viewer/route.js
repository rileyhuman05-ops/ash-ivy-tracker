import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODEL_RELATIVE = path.join(
  "warehouse-model",
  "warehouse-site-preview-v3.html"
);

/**
 * Auth temporarily disabled for tonight's go-live.
 * Re-enable session checks in lib/auth.js + middleware when ready.
 */
export async function GET() {
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
