import { prisma, VipPassStatus } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, notFound, sameOrigin, serverError } from "@/lib/api";
import { canManageEvent } from "@/lib/authz";
import { requireOrganizerApi } from "@/lib/organizer-guard";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ passId: string }> };

/** Revoke a guest pass. The shared link stops working immediately. */
export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).passId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid pass id.");

  try {
    const pass = await prisma.vipPass.findUnique({
      where: { id: idResult.data },
      include: { event: true },
    });
    if (!pass || !canManageEvent(user, pass.event)) return notFound();

    // Revoked rather than deleted: a used pass is part of the entry record.
    await prisma.vipPass.update({
      where: { id: pass.id },
      data: { status: VipPassStatus.REVOKED },
    });

    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: pass.eventId,
      action: "VIP_PASS_REVOKED",
      metadata: { guestName: pass.guestName, passId: pass.id },
    });

    return ok({ revoked: true });
  } catch (err) {
    return serverError("revoke vip pass", err);
  }
}
