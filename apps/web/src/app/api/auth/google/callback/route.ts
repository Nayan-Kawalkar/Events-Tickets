import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma, Role } from "@ct/db";
import { audit } from "@/lib/audit";
import { allowedEmailDomains, isProduction } from "@/lib/env";
import {
  FLOW_COOKIE,
  exchangeCode,
  googleEnabled,
  openFlow,
  safeEqual,
  safeReturnTo,
  type GoogleIdentity,
} from "@/lib/google-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google sends the browser back here with an authorization code.
 *
 * Every exit from this route is a redirect, never a JSON error: the caller is a
 * browser mid-navigation, so an error body would strand the person on a blank
 * page. What they see is a short reason on the sign-in page; what actually went
 * wrong is written to the log and the audit trail.
 */

/** Bounce back to sign-in with a reason, and record the attempt. */
async function fail(
  request: Request,
  error: string,
  detail: { email?: string; reason?: string } = {},
) {
  await audit({
    entityType: "User",
    entityId: detail.email ?? "unknown",
    action: "USER_LOGIN_FAILED",
    metadata: { provider: "google", error, ...(detail.reason ? { reason: detail.reason } : {}) },
  });
  return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
}

type Resolved =
  | { ok: true; userId: string; created: boolean; linked: boolean }
  | { ok: false; error: "already_linked" | "conflict" };

/**
 * Find, link, or create the account behind a Google identity.
 *
 * Retried once because two first-time sign-ins for the same address can race:
 * both see no user, both insert, and one loses on the unique index. That loser
 * should end up signed in to the row the winner created, not shown an error.
 */
async function resolveUser(identity: GoogleIdentity): Promise<Resolved> {
  for (let attempt = 0; attempt < 2; attempt++) {
    // Matched on the Google subject first: it survives the person changing the
    // address on their Google account.
    const byGoogle = await prisma.user.findUnique({
      where: { googleId: identity.googleId },
      select: { id: true },
    });
    if (byGoogle) return { ok: true, userId: byGoogle.id, created: false, linked: false };

    const byEmail = await prisma.user.findUnique({
      where: { email: identity.email },
      select: { id: true, googleId: true },
    });

    if (byEmail) {
      // Someone else's Google account already owns this row. Refuse rather than
      // silently move the link.
      if (byEmail.googleId && byEmail.googleId !== identity.googleId) {
        return { ok: false, error: "already_linked" };
      }
      // Google has told us the address is verified, so linking is safe and
      // means a password signup keeps one account rather than gaining a second.
      const linked = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: identity.googleId, isEmailVerified: true },
        select: { id: true },
      });
      return { ok: true, userId: linked.id, created: false, linked: true };
    }

    try {
      // First time here: a plain student account, no password. Roles are only
      // ever granted by an admin, never by whoever signs in.
      const created = await prisma.user.create({
        data: {
          email: identity.email,
          fullName: identity.fullName,
          googleId: identity.googleId,
          passwordHash: null,
          isEmailVerified: true,
          role: Role.STUDENT,
        },
        select: { id: true },
      });
      return { ok: true, userId: created.id, created: true, linked: false };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // P2002 is the unique index firing: someone created this account between
      // our read and our write. Go round again and we will find their row.
      if (code === "P2002" && attempt === 0) continue;
      throw err;
    }
  }

  return { ok: false, error: "conflict" };
}

export async function GET(request: Request) {
  if (!googleEnabled()) return fail(request, "google_unavailable");

  const ip = await clientIp();
  const limit = rateLimit(`google-callback:ip:${ip}`, 20, 15 * 60);
  if (!limit.ok) return fail(request, "rate_limited");

  const store = await cookies();
  const flow = openFlow(store.get(FLOW_COOKIE)?.value);
  // One flow per cookie: clear it before doing anything else so a code cannot
  // be replayed against the same handshake.
  store.set(FLOW_COOKIE, "", { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: 0 });

  if (!flow) return fail(request, "expired");

  const params = new URL(request.url).searchParams;

  const oauthError = params.get("error");
  if (oauthError) {
    // Declining at Google's screen is a choice, not a failure: send them back
    // to sign-in quietly. Anything else is a real fault and gets a message.
    if (oauthError === "access_denied") {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    console.error("[google-auth] provider returned an error", {
      error: oauthError,
      description: params.get("error_description"),
    });
    return fail(request, "google_failed", { reason: oauthError });
  }

  const state = params.get("state");
  const code = params.get("code");
  if (!state || !safeEqual(state, flow.state)) return fail(request, "bad_state");
  if (!code) return fail(request, "no_code");

  const exchanged = await exchangeCode(code, flow);
  if (!exchanged.ok) {
    // Unreachable is a transient fault worth distinguishing: retrying may work,
    // whereas a rejection means something is misconfigured.
    const error = exchanged.reason === "EXCHANGE_UNREACHABLE" ? "google_unreachable" : "google_failed";
    return fail(request, error, { reason: exchanged.reason });
  }
  const identity = exchanged.identity;

  // Without this an attacker could hand Google an address they do not control
  // and be handed the matching account here.
  if (!identity.emailVerified) {
    return fail(request, "email_unverified", { email: identity.email });
  }

  const domain = identity.email.split("@")[1] ?? "";
  if (allowedEmailDomains.length > 0 && !allowedEmailDomains.includes(domain)) {
    return fail(request, "domain_not_allowed", { email: identity.email });
  }

  try {
    const resolved = await resolveUser(identity);

    if (!resolved.ok) {
      return fail(request, resolved.error, { email: identity.email });
    }

    await audit({
      actorUserId: resolved.userId,
      entityType: "User",
      entityId: resolved.userId,
      action: resolved.created ? "USER_REGISTERED" : "USER_LOGIN_SUCCEEDED",
      metadata: { provider: "google", ...(resolved.linked ? { linked: true } : {}) },
    });

    await setSessionCookie(resolved.userId);
    return NextResponse.redirect(new URL(safeReturnTo(flow.returnTo), request.url));
  } catch (err) {
    console.error("[google-auth] sign-in failed", err);
    return fail(request, "server_error", { email: identity.email });
  }
}
