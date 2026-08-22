import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, notFound, sameOrigin, serverError } from "@/lib/api";
import { canManageEvent } from "@/lib/authz";
import { requireOrganizerApi } from "@/lib/organizer-guard";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ assignmentId: string }> };

/** Revoke a volunteer's access to one event. Their account is left alone. */
export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).assignmentId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid assignment id.");

  try {
    const assignment = await prisma.scannerAssignment.findUnique({
      where: { id: idResult.data },
      include: { event: true, user: { select: { email: true } } },
    });
    // Checked through the event, so a guessed id reveals nothing.
    if (!assignment || !canManageEvent(user, assignment.event)) return notFound();

    await prisma.scannerAssignment.delete({ where: { id: assignment.id } });

    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: assignment.eventId,
      action: "SCANNER_REVOKED",
      metadata: { volunteer: assignment.user.email },
    });

    return ok({ deleted: true });
  } catch (err) {
    return serverError("revoke scanner", err);
  }
}
