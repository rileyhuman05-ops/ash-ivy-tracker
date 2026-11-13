import { readFile } from "node:fs/promises";
import path from "node:path";
import { readSessionFromRequest } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODEL_RELATIVE = path.join(
  "warehouse-model",
  "warehouse-site-preview-v3.html"
);

export async function GET(request) {
  if (!readSessionFromRequest(request)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
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

  // Treat upload as v3 even if the embedded title still says preview v2.
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
