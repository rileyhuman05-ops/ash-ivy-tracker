import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireIdentity } from "../../../../cursor/identity.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ASSETS = {
  three: {
    relative: path.join("server-data", "vendor", "three.min.js"),
    type: "application/javascript; charset=utf-8",
  },
  orbit: {
    relative: path.join("server-data", "vendor", "OrbitControls.js"),
    type: "application/javascript; charset=utf-8",
  },
  data: {
    relative: path.join("server-data", "warehouse-site-data.js"),
    type: "application/javascript; charset=utf-8",
  },
};

/**
 * Identity-gated vendor / seed-data scripts for the warehouse HTML.
 * Keeps large third-party bundles out of the main HTML file.
 */
export async function GET(request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) {
    return identity;
  }

  const name = new URL(request.url).searchParams.get("name");
  const asset = ASSETS[name];
  if (!asset) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }

  try {
    const body = await readFile(path.join(process.cwd(), asset.relative), "utf8");
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": asset.type,
        "cache-control": "private, max-age=3600",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return new Response("Asset missing on server", {
      status: 500,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }
}
