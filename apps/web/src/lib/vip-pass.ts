import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, VipPassStatus } from "@ct/db";
import { env } from "./env";

/**
 * VIP guest passes.
 *
 * An organizer hands these out directly — a chief guest, a sponsor, a judge —
 * to people who will not register and may not have an account. Holding the link
 * is the entitlement, so the constraints matter:
 *
 *  - the code is random and unguessable, and is the whole secret;
 *  - it opens exactly one event, never another;
 *  - it admits once, enforced by a conditional write;
 *  - it can be revoked, and dies with the event.
 */
export const VIP_VERSION = "vip1";

function sign(code: string, expiresAt: number) {
  return createHmac("sha256", env.QR_SIGNING_SECRET)
    .update(`${VIP_VERSION}.${code}.${expiresAt}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isVipPassPayload(payload: string) {
  return payload.trim().startsWith(`${VIP_VERSION}.`);
}

/** Valid until the event ends, plus the same grace window a ticket QR gets. */
export function vipExpiry(eventEndsAt: Date) {
  return new Date(eventEndsAt.getTime() + env.QR_TTL_SECONDS * 1000);
}

export function buildVipPayload(pass: { code: string }, eventEndsAt: Date) {
  const expiresAt = Math.floor(vipExpiry(eventEndsAt).getTime() / 1000);
  return `${VIP_VERSION}.${pass.code}.${expiresAt}.${sign(pass.code, expiresAt)}`;
}

type Verified = { ok: true; code: string } | { ok: false; reason: "MALFORMED" | "INVALID_SIGNATURE" | "EXPIRED" };

export function verifyVipPayload(payload: string): Verified {
  const parts = payload.trim().split(".");
  if (parts.length !== 4) return { ok: false, reason: "MALFORMED" };

  const [version, code, expiresRaw, signature] = parts as [string, string, string, string];
  if (version !== VIP_VERSION) return { ok: false, reason: "MALFORMED" };
  if (!code || !/^[A-Za-z0-9_-]{1,128}$/.test(code)) return { ok: false, reason: "MALFORMED" };

  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return { ok: false, reason: "MALFORMED" };
  if (!safeEqual(signature, sign(code, expiresAt))) return { ok: false, reason: "INVALID_SIGNATURE" };
  if (expiresAt * 1000 <= Date.now()) return { ok: false, reason: "EXPIRED" };

  return { ok: true, code };
}

export function generateVipCode() {
  return `vip_${randomBytes(18).toString("base64url")}`;
}

export type VipRejection =
  | "INVALID"
  | "INVALID_SIGNATURE"
  | "EXPIRED"
  | "NOT_FOUND"
  | "WRONG_EVENT"
  | "ALREADY_USED"
  | "REVOKED";

export type VipConsumeResult =
  | { ok: true; pass: { id: string; guestName: string } }
  | { ok: false; reason: VipRejection };

/** Verify and consume a VIP pass for one event. */
export async function consumeVipPass(params: {
  payload: string;
  eventId: string;
  scannerUserId: string;
  gateId: string;
}): Promise<VipConsumeResult> {
  const verified = verifyVipPayload(params.payload);
  if (!verified.ok) {
    if (verified.reason === "INVALID_SIGNATURE") return { ok: false, reason: "INVALID_SIGNATURE" };
    if (verified.reason === "EXPIRED") return { ok: false, reason: "EXPIRED" };
    return { ok: false, reason: "INVALID" };
  }

  // Guarded on both the event and ACTIVE, so a pass cannot be used twice and
  // cannot be carried to a different gate.
  const consumed = await prisma.vipPass.updateMany({
    where: { code: verified.code, eventId: params.eventId, status: VipPassStatus.ACTIVE },
    data: {
      status: VipPassStatus.USED,
      usedAt: new Date(),
      usedByUserId: params.scannerUserId,
      usedGateId: params.gateId,
    },
  });

  if (consumed.count === 1) {
    const pass = await prisma.vipPass.findUnique({
      where: { code: verified.code },
      select: { id: true, guestName: true },
    });
    return { ok: true, pass: pass ?? { id: "", guestName: "VIP guest" } };
  }

  const current = await prisma.vipPass.findUnique({
    where: { code: verified.code },
    select: { status: true, eventId: true },
  });

  if (!current) return { ok: false, reason: "NOT_FOUND" };
  if (current.eventId !== params.eventId) return { ok: false, reason: "WRONG_EVENT" };
  if (current.status === VipPassStatus.USED) return { ok: false, reason: "ALREADY_USED" };
  return { ok: false, reason: "REVOKED" };
}
