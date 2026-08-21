import { z } from "zod";
import { prisma, EventStatus } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, notFound, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const patchSchema = z.object({ status: z.nativeEnum(EventStatus) }).strict();

type Params = { params: Promise<{ eventId: string }> };

/** Admin override: set any event's status, regardless of who created it. */
export async function PATCH(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  const parsed = await parseJson(request, patchSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const event = await prisma.event.findUnique({
      where: { id: idResult.data },
      select: { id: true, title: true, status: true },
    });
    if (!event) return notFound();

    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { status: parsed.data.status },
      select: { id: true, title: true, status: true },
    });

    await audit({
      actorUserId: admin.id,
      entityType: "Event",
      entityId: event.id,
      action: "ADMIN_EVENT_STATUS_CHANGED",
      metadata: { title: event.title, from: event.status, to: updated.status },
    });

    return ok({ event: updated });
  } catch (err) {
    return serverError("admin update event", err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  try {
    const event = await prisma.event.findUnique({
      where: { id: idResult.data },
      select: { id: true, title: true, slug: true, _count: { select: { tickets: true } } },
    });
    if (!event) return notFound();

    // Deleting an event with tickets would erase attendees' proof of entry.
    // Cancelling keeps the record and tells attendees what happened.
    if (event._count.tickets > 0) {
      return fail(
        409,
        "HAS_TICKETS",
        `Cannot delete: ${event._count.tickets} ticket(s) exist. Set the status to CANCELLED instead.`,
      );
    }

    await prisma.event.delete({ where: { id: event.id } });

    await audit({
      actorUserId: admin.id,
      entityType: "Event",
      entityId: event.id,
      action: "ADMIN_EVENT_DELETED",
      metadata: { title: event.title, slug: event.slug },
    });

    return ok({ deleted: true });
  } catch (err) {
    return serverError("admin delete event", err);
  }
}
