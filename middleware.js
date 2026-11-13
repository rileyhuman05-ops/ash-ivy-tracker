import { NextResponse } from "next/server";

// Auth gate temporarily disabled for tonight. Re-enable cookie checks when
// password login returns.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/viewer", "/api/viewer"],
};
