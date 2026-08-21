import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Signed QR payloads.
 *
 * Format: `v1.<publicId>.<expiresAtUnixSeconds>.<signature>`
 *
 * The payload carries no personal data — only an unguessable ticket id, an
 * expiry and an HMAC-SHA256 signature over the first three parts. A forged or
 * edited payload fails verification; a valid one still has to survive the
 * database checks, because a signature proves authenticity, not unusedness.
 */

export const QR_VERSION = "v1";

export type QrVerifyFailure =
  | "MALFORMED"
  | "UNSUPPORTED_VERSION"
  | "INVALID_SIGNATURE"
  | "EXPIRED";

export type QrVerifyResult =
  | { ok: true; publicId: string; expiresAt: Date }
  | { ok: false; reason: QrVerifyFailure };

function sign(version: string, publicId: string, expiresAt: number) {
  return createHmac("sha256", env.QR_SIGNING_SECRET)
    .update(`${version}.${publicId}.${expiresAt}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Static QR: valid until the event ends plus a grace window, so a ticket cannot
 * be presented at an unrelated event weeks later.
 */
export function qrExpiryFor(eventEndsAt: Date) {
  return new Date(eventEndsAt.getTime() + env.QR_TTL_SECONDS * 1000);
}

export function generateQrPayload(ticket: { publicId: string; event: { endsAt: Date } }) {
  const expiresAt = Math.floor(qrExpiryFor(ticket.event.endsAt).getTime() / 1000);
  return `${QR_VERSION}.${ticket.publicId}.${expiresAt}.${sign(QR_VERSION, ticket.publicId, expiresAt)}`;
}

export function verifyQrPayload(payload: string): QrVerifyResult {
  const parts = payload.trim().split(".");
  if (parts.length !== 4) return { ok: false, reason: "MALFORMED" };

  const [version, publicId, expiresRaw, signature] = parts as [string, string, string, string];
  if (version !== QR_VERSION) return { ok: false, reason: "UNSUPPORTED_VERSION" };
  if (!publicId || !/^[A-Za-z0-9_-]{1,128}$/.test(publicId)) return { ok: false, reason: "MALFORMED" };

  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return { ok: false, reason: "MALFORMED" };

  // Verify the signature before trusting any field, including the expiry.
  if (!safeEqual(signature, sign(version, publicId, expiresAt))) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  if (expiresAt * 1000 <= Date.now()) return { ok: false, reason: "EXPIRED" };

  return { ok: true, publicId, expiresAt: new Date(expiresAt * 1000) };
}
