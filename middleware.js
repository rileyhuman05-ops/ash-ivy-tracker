import { NextResponse } from "next/server";

// Warehouse password middleware removed. Access is Cursor Private identity
// enforced in /api/viewer via requireIdentity.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/viewer", "/api/viewer"],
};
