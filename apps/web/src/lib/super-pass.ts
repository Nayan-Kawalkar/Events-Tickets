import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, SuperPassStatus } from "@ct/db";
import { env } from "./env";

/**
 * Admin master pass.
 *
 * A super pass opens any gate, once. That makes it the most dangerous object in
 * the system, so every property here is a deliberate limit:
 *
 *  - its payload uses a different version prefix from a ticket, so the two can
 *    never be confused by the verifier;
 *  - it is consumed by a conditional UPDATE, exactly like a ticket, so it
 *    cannot admit two people;
 *  - it expires on a short timer even if never used;
 *  - issuing a new one revokes the previous active one, so at most one master
 *    key exists at a time.
 */

export const SUPER_PASS_VERSION = "sp1";

function sign(version: string, code: string, expiresAt: number) {
  return createHmac("sha256", env.QR_SIGNING_SECRET)
    .update(`${version}.${code}.${expiresAt}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True when a payload is a super pass rather than a ticket. */
export function isSuperPassPayload(payload: string) {
  return payload.trim().startsWith(`${SUPER_PASS_VERSION}.`);
}

export function buildSuperPassPayload(pass: { code: string; expiresAt: Date }) {
  const expiresAt = Math.floor(pass.expiresAt.getTime() / 1000);
  return `${SUPER_PASS_VERSION}.${pass.code}.${expiresAt}.${sign(SUPER_PASS_VERSION, pass.code, expiresAt)}`;
}

type VerifyResult = { ok: true; code: string } | { ok: false; reason: "MALFORMED" | "INVALID_SIGNATURE" | "EXPIRED" };

export function verifySuperPassPayload(payload: string): VerifyResult {
  const parts = payload.trim().split(".");
  if (parts.length !== 4) return { ok: false, reason: "MALFORMED" };

  const [version, code, expiresRaw, signature] = parts as [string, string, string, string];
  if (version !== SUPER_PASS_VERSION) return { ok: false, reason: "MALFORMED" };
  if (!code || !/^[A-Za-z0-9_-]{1,128}$/.test(code)) return { ok: false, reason: "MALFORMED" };

  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return { ok: false, reason: "MALFORMED" };

  if (!safeEqual(signature, sign(version, code, expiresAt))) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }
  if (expiresAt * 1000 <= Date.now()) return { ok: false, reason: "EXPIRED" };

  return { ok: true, code };
}

/**
 * Issue a pass, revoking any that is still active.
 *
 * Done in one transaction so there is never a moment with two live master keys.
 */
export async function issueSuperPass(params: {
  createdByUserId: string;
  label?: string | null;
  ttlSeconds: number;
}) {
  const { createdByUserId, label, ttlSeconds } = params;

  return prisma.$transaction(async (tx) => {
    const revoked = await tx.superPass.updateMany({
      where: { status: SuperPassStatus.ACTIVE },
      data: { status: SuperPassStatus.REVOKED },
    });

    const pass = await tx.superPass.create({
      data: {
        code: `sp_${randomBytes(16).toString("base64url")}`,
        label: label || null,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        createdByUserId,
      },
      select: { id: true, code: true, label: true, expiresAt: true, createdAt: true },
    });

    return { pass, revokedCount: revoked.count };
  });
}

export type SuperPassRejection = "INVALID" | "INVALID_SIGNATURE" | "EXPIRED" | "ALREADY_USED" | "REVOKED";

export type SuperPassConsumeResult =
  | { ok: true; pass: { id: string; label: string | null } }
  | { ok: false; reason: SuperPassRejection };

/** Verify and consume a super pass. Single use, enforced by the database. */
export async function consumeSuperPass(params: {
  payload: string;
  scannerUserId: string;
  eventId: string;
  gateId: string;
}): Promise<SuperPassConsumeResult> {
  const verified = verifySuperPassPayload(params.payload);
  if (!verified.ok) {
    if (verified.reason === "INVALID_SIGNATURE") return { ok: false, reason: "INVALID_SIGNATURE" };
    if (verified.reason === "EXPIRED") return { ok: false, reason: "EXPIRED" };
    return { ok: false, reason: "INVALID" };
  }

  // Conditional write: only an ACTIVE, unexpired pass can be consumed, and only
  // once. A second scan of the same QR affects zero rows.
  const consumed = await prisma.superPass.updateMany({
    where: {
      code: verified.code,
      status: SuperPassStatus.ACTIVE,
      expiresAt: { gt: new Date() },
    },
    data: {
      status: SuperPassStatus.USED,
      usedAt: new Date(),
      usedByUserId: params.scannerUserId,
      usedEventId: params.eventId,
      usedGateId: params.gateId,
    },
  });

  if (consumed.count === 1) {
    const pass = await prisma.superPass.findUnique({
      where: { code: verified.code },
      select: { id: true, label: true },
    });
    return { ok: true, pass: pass ?? { id: "", label: null } };
  }

  const current = await prisma.superPass.findUnique({
    where: { code: verified.code },
    select: { status: true, expiresAt: true },
  });

  if (!current) return { ok: false, reason: "INVALID" };
  if (current.status === SuperPassStatus.USED) return { ok: false, reason: "ALREADY_USED" };
  if (current.status === SuperPassStatus.REVOKED) return { ok: false, reason: "REVOKED" };
  return { ok: false, reason: "EXPIRED" };
}
