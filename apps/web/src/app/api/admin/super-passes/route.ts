import { z } from "zod";
import { prisma, SuperPassStatus } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import { issueSuperPass } from "@/lib/super-pass";

export const runtime = "nodejs";

const createSchema = z
  .object({
    label: z.string().trim().max(80).optional().or(z.literal("")),
    // Bounded on purpose: a master key that lives for hours is a liability.
    ttlMinutes: z.coerce.number().int().min(1).max(120).default(15),
  })
  .strict();

/** Issue a master pass. Admin only, and it replaces any active one. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  const parsed = await parseJson(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const { label, ttlMinutes } = parsed.data;

  try {
    const { pass, revokedCount } = await issueSuperPass({
      createdByUserId: admin.id,
      label: label || null,
      ttlSeconds: ttlMinutes * 60,
    });

    await audit({
      actorUserId: admin.id,
      entityType: "SuperPass",
      entityId: pass.id,
      action: "SUPER_PASS_ISSUED",
      metadata: {
        label: pass.label,
        expiresAt: pass.expiresAt.toISOString(),
        revokedPrevious: revokedCount,
      },
    });

    return ok({ pass: { id: pass.id, expiresAt: pass.expiresAt.toISOString() }, revokedCount }, 201);
  } catch (err) {
    return serverError("issue super pass", err);
  }
}

/** Revoke the active pass without issuing a replacement. */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  try {
    const revoked = await prisma.superPass.updateMany({
      where: { status: SuperPassStatus.ACTIVE },
      data: { status: SuperPassStatus.REVOKED },
    });

    await audit({
      actorUserId: admin.id,
      entityType: "SuperPass",
      entityId: "active",
      action: "SUPER_PASS_REVOKED",
      metadata: { revokedCount: revoked.count },
    });

    return ok({ revokedCount: revoked.count });
  } catch (err) {
    return serverError("revoke super pass", err);
  }
}
