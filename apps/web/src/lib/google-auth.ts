import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { safeNext } from "./nav";

/**
 * Google sign-in, OAuth 2.0 authorization code flow with PKCE.
 *
 * Written directly rather than pulled in from an auth library: this app already
 * owns its session (an HMAC-signed cookie), its user table and its role model,
 * and adopting a framework would mean handing all three over for one provider.
 *
 * The parts that carry the security weight:
 *
 *  - `state` ties the callback to the browser that started the flow (CSRF).
 *  - `nonce` ties the returned id_token to this same request (replay).
 *  - PKCE means a stolen authorization code is useless without the verifier.
 *  - `email_verified` is required before an account is matched or created,
 *    which is what stops someone claiming an address they do not own.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** The handshake is short-lived; ten minutes is more than any real sign-in. */
export const FLOW_TTL_SECONDS = 600;
export const FLOW_COOKIE = "ct_oauth";

/**
 * Configured or not. The feature is optional: with no credentials the button
 * never renders and the routes refuse, rather than the app failing to boot.
 */
export function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google sign-in is not configured");
  return { clientId, clientSecret };
}

/** Must match a redirect URI registered in the Google Cloud console exactly. */
export function redirectUri() {
  return new URL("/api/auth/google/callback", env.APP_URL).toString();
}

export type FlowState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
};

function base64url(buf: Buffer) {
  return buf.toString("base64url");
}

export function createFlowState(returnTo: string): FlowState {
  return {
    state: base64url(randomBytes(24)),
    nonce: base64url(randomBytes(24)),
    verifier: base64url(randomBytes(48)),
    returnTo,
  };
}

/**
 * The in-flight handshake is carried in an httpOnly cookie and signed, so a
 * cookie planted by anything else (a sibling subdomain, say) cannot start a
 * flow that lands in this browser's session.
 */
export function sealFlow(flow: FlowState) {
  const body = Buffer.from(JSON.stringify(flow)).toString("base64url");
  const mac = createHmac("sha256", env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function openFlow(sealed: string | undefined): FlowState | null {
  if (!sealed) return null;
  const [body, mac] = sealed.split(".");
  if (!body || !mac) return null;

  const expected = createHmac("sha256", env.SESSION_SECRET).update(body).digest("base64url");
  if (!safeEqual(mac, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as FlowState;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.verifier !== "string" ||
      typeof parsed.returnTo !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Only ever send someone back to a path on this site. An absolute URL — or the
 * protocol-relative `//evil.test` form — would turn sign-in into an open
 * redirect.
 */
export function safeReturnTo(value: string | null | undefined) {
  return safeNext(value);
}

export function authorizationUrl(flow: FlowState) {
  const { clientId } = credentials();
  const challenge = base64url(createHash("sha256").update(flow.verifier).digest());

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Ask every time rather than silently reusing whichever account the browser
  // happens to be signed into.
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export type GoogleIdentity = {
  googleId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
};

type TokenResponse = { id_token?: string; error?: string; error_description?: string };

/**
 * Swap the authorization code for an id_token and read the identity out of it.
 *
 * The token comes straight back from Google's token endpoint over TLS, which
 * is what lets us read the id_token's claims without fetching Google's signing
 * keys (OpenID Connect Core 3.1.3.7: a token received directly from the issuer
 * over a verified channel does not need its signature checked separately).
 * Every claim we actually rely on is still validated below.
 */
export async function exchangeCode(code: string, flow: FlowState): Promise<
  { ok: true; identity: GoogleIdentity } | { ok: false; reason: string }
> {
  const { clientId, clientSecret } = credentials();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
    code_verifier: flow.verifier,
  });

  let payload: TokenResponse | null = null;

  // One retry, and only for a transport failure. A rejection from Google is
  // final — an authorization code is single-use, so replaying it after a real
  // refusal would just burn it and confuse the logs.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        // Google is normally fast; do not let a hung request hold a page open.
        signal: AbortSignal.timeout(10_000),
      });

      const parsed = (await response.json().catch(() => ({}))) as TokenResponse;

      if (!response.ok) {
        console.error(
          "[google-auth] token exchange rejected",
          { status: response.status, error: parsed.error, description: parsed.error_description },
        );
        // redirect_uri_mismatch is by far the most common setup mistake, and
        // the message alone rarely makes that obvious.
        if (parsed.error === "redirect_uri_mismatch") {
          console.error(
            `[google-auth] the redirect URI registered with Google must exactly match: ${redirectUri()}`,
          );
        }
        return { ok: false, reason: "EXCHANGE_REJECTED" };
      }

      payload = parsed;
      break;
    } catch (err) {
      const last = attempt === 1;
      console.error(`[google-auth] token exchange failed (attempt ${attempt + 1}/2)`, err);
      if (last) return { ok: false, reason: "EXCHANGE_UNREACHABLE" };
    }
  }

  if (!payload) return { ok: false, reason: "EXCHANGE_UNREACHABLE" };

  if (!payload.id_token) return { ok: false, reason: "NO_ID_TOKEN" };

  const parts = payload.id_token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "MALFORMED_TOKEN" };

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1] as string, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED_TOKEN" };
  }

  const { clientId: audience } = credentials();
  const iss = typeof claims.iss === "string" ? claims.iss : "";
  const aud = typeof claims.aud === "string" ? claims.aud : "";
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const nonce = typeof claims.nonce === "string" ? claims.nonce : "";

  // Each of these is logged with its specific cause: the browser is told only
  // that sign-in failed, so the server log is the sole place the reason exists.
  const reject = (reason: string) => {
    console.error("[google-auth] id_token rejected", { reason });
    return { ok: false as const, reason };
  };

  if (!ISSUERS.includes(iss)) return reject("BAD_ISSUER");
  // Someone else's client id would mean a token minted for a different app.
  if (!aud || !safeEqual(aud, audience)) return reject("BAD_AUDIENCE");
  if (exp * 1000 <= Date.now()) return reject("TOKEN_EXPIRED");
  if (!nonce || !safeEqual(nonce, flow.nonce)) return reject("BAD_NONCE");
  if (!sub) return reject("NO_SUBJECT");
  if (!email) return reject("NO_EMAIL");

  // Google sends this as a boolean, but it has historically also appeared as a
  // string, so accept both and treat anything else as unverified.
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";

  const name = typeof claims.name === "string" ? claims.name.trim() : "";

  return {
    ok: true,
    identity: {
      googleId: sub,
      email,
      emailVerified,
      // Falling back to the local part gives a usable display name rather than
      // an empty one; the person can edit it in their profile.
      fullName: name || (email.split("@")[0] as string),
    },
  };
}
