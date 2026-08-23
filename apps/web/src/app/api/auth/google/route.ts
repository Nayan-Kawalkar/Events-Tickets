import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  FLOW_COOKIE,
  FLOW_TTL_SECONDS,
  authorizationUrl,
  createFlowState,
  googleEnabled,
  safeReturnTo,
  sealFlow,
} from "@/lib/google-auth";
import { isProduction } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start the Google handshake: stash the flow, then hand off to Google. */
export async function GET(request: Request) {
  if (!googleEnabled()) {
    return NextResponse.redirect(new URL("/login?error=google_unavailable", request.url));
  }

  // Cheap to call, so worth a limit: each hit mints crypto material and sets a
  // cookie.
  const ip = await clientIp();
  const limit = rateLimit(`google-start:ip:${ip}`, 20, 15 * 60);
  if (!limit.ok) {
    return NextResponse.redirect(new URL("/login?error=rate_limited", request.url));
  }

  try {
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
    const flow = createFlowState(returnTo);

    const store = await cookies();
    store.set(FLOW_COOKIE, sealFlow(flow), {
      httpOnly: true,
      secure: isProduction,
      // "lax" still sends the cookie on Google's top-level redirect back here,
      // which is exactly the case this needs to survive.
      sameSite: "lax",
      path: "/",
      maxAge: FLOW_TTL_SECONDS,
    });

    return NextResponse.redirect(authorizationUrl(flow));
  } catch (err) {
    // A malformed APP_URL or a missing secret would otherwise surface as a raw
    // 500 in the middle of a sign-in.
    console.error("[google-auth] could not start the sign-in flow", err);
    return NextResponse.redirect(new URL("/login?error=server_error", request.url));
  }
}
