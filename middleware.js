import { NextResponse } from "next/server";

/**
 * Block direct URL access to server-only warehouse HTML / data paths.
 * The model is only served from GET /api/viewer after requireIdentity.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/warehouse-model") ||
    pathname.startsWith("/server-data")
  ) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/warehouse-model/:path*", "/server-data/:path*"],
};
