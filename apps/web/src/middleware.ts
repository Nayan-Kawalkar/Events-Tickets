import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ct_session";

/**
 * A cheap first gate only: it checks that a session cookie is present and sends
 * anonymous visitors to the login page with a return path.
 *
 * It deliberately does NOT verify the signature or the role — middleware runs on
 * the edge runtime without database access, and a cookie's contents are not
 * evidence. Every protected page and API route re-checks identity and role
 * server-side (see lib/auth.ts and lib/authz.ts); that is the real boundary.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/organizer/:path*", "/student/:path*", "/scanner/:path*"],
};
