import { NextResponse } from "next/server";

// Soft gate: unauthenticated viewers of /viewer bounce to login.
// The HTML itself is only served from /api/viewer after a verified session cookie.
export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/viewer" && !pathname.startsWith("/api/viewer")) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("bayline_warehouse_session");
  if (!cookie?.value) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("error", "Please sign in");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/viewer", "/api/viewer"],
};
