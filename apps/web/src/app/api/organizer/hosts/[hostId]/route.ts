import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, notFound, sameOrigin, serverError } from "@/lib/api";
import { canManageEvent } from "@/lib/authz";
import { requireOrganizerApi } from "@/lib/organizer-guard";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ hostId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).hostId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid host id.");

  try {
    const host = await prisma.eventHost.findUnique({
      where: { id: idResult.data },
      include: { event: true },
    });
    // Ownership is checked through the event, so a guessed id reveals nothing.
    if (!host || !canManageEvent(user, host.event)) return notFound();

    await prisma.eventHost.delete({ where: { id: host.id } });

    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: host.eventId,
      action: "EVENT_UPDATED",
      metadata: { changedFields: ["hosts"], removedHost: host.name },
    });

    return ok({ deleted: true });
  } catch (err) {
    return serverError("remove event host", err);
  }
}
