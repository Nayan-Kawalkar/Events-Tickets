import { prisma } from "@ct/db";
import { revalidateEventById } from "@/lib/event-cache";
import { audit } from "@/lib/audit";
import { ok, fail, notFound, parseJson, sameOrigin, serverError } from "@/lib/api";
import { canManageEvent } from "@/lib/authz";
import { countLiveTickets, requireOrganizerApi } from "@/lib/organizer-guard";
import { updateTicketTypeSchema, uuidSchema } from "@/lib/validation";
import type { SessionUser } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ ticketTypeId: string }> };

/** Load a ticket type together with its event, enforcing event ownership. */
async function loadOwned(user: SessionUser, ticketTypeId: string) {
  const ticketType = await prisma.ticketType.findUnique({
    where: { id: ticketTypeId },
    include: { event: true },
  });
  if (!ticketType) return null;
  if (!canManageEvent(user, ticketType.event)) return null;
  return ticketType;
}

export async function PATCH(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).ticketTypeId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid ticket type id.");

  const ticketType = await loadOwned(user, idResult.data);
  if (!ticketType) return notFound();

  const parsed = await parseJson(request, updateTicketTypeSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data as Record<string, unknown>;

  try {
    const issued = await countLiveTickets({ ticketTypeId: ticketType.id });

    if (input.capacity !== undefined && input.capacity !== null) {
      const nextCapacity = input.capacity as number;
      if (nextCapacity < issued) {
        return fail(409, "CAPACITY_BELOW_SOLD", "Capacity cannot be lower than tickets already issued.", {
          capacity: `${issued} ticket(s) already issued`,
        });
      }

      if (ticketType.event.capacity !== null) {
        const agg = await prisma.ticketType.aggregate({
          where: { eventId: ticketType.eventId, id: { not: ticketType.id } },
          _sum: { capacity: true },
        });
        const allocated = (agg._sum.capacity ?? 0) + nextCapacity;
        if (allocated > ticketType.event.capacity) {
          return fail(409, "OVER_ALLOCATED", "Ticket type capacities exceed the event capacity.", {
            capacity: `Only ${ticketType.event.capacity - (agg._sum.capacity ?? 0)} seats remain unallocated`,
          });
        }
      }
    }

    // Once tickets exist, the price and the student-ID requirement are locked:
    // changing them would retroactively alter what attendees agreed to.
    if (issued > 0) {
      if (input.pricePaise !== undefined && input.pricePaise !== ticketType.pricePaise) {
        return fail(409, "LOCKED_FIELD", "Price cannot change after tickets are issued.", {
          pricePaise: `${issued} ticket(s) already issued`,
        });
      }
      if (
        input.requiresStudentId !== undefined &&
        input.requiresStudentId !== ticketType.requiresStudentId
      ) {
        return fail(409, "LOCKED_FIELD", "Student ID requirement cannot change after tickets are issued.", {
          requiresStudentId: `${issued} ticket(s) already issued`,
        });
      }
    }

    const updated = await prisma.ticketType.update({
      where: { id: ticketType.id },
      data: {
        ...(input.phoneMode !== undefined ? { phoneMode: input.phoneMode as never } : {}),
        ...(input.rollNumberMode !== undefined
          ? {
              rollNumberMode: input.rollNumberMode as never,
              // Kept in step with the mode so the older flag never
              // disagrees with the form the buyer actually sees.
              requiresStudentId: input.rollNumberMode === "REQUIRED",
            }
          : {}),
        ...(input.departmentMode !== undefined ? { departmentMode: input.departmentMode as never } : {}),
        ...(input.name !== undefined ? { name: input.name as string } : {}),
        ...(input.description !== undefined ? { description: (input.description as string) || null } : {}),
        ...(input.pricePaise !== undefined ? { pricePaise: input.pricePaise as number } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity as number | null } : {}),
        ...(input.salesStartAt !== undefined ? { salesStartAt: input.salesStartAt as Date | null } : {}),
        ...(input.salesEndAt !== undefined ? { salesEndAt: input.salesEndAt as Date | null } : {}),
        ...(input.requiresStudentId !== undefined
          ? { requiresStudentId: input.requiresStudentId as boolean }
          : {}),
        ...(input.requiresApproval !== undefined
          ? { requiresApproval: input.requiresApproval as boolean }
          : {}),
        ...(input.transferable !== undefined ? { transferable: input.transferable as boolean } : {}),
        ...(input.maxPerUser !== undefined ? { maxPerUser: input.maxPerUser as number } : {}),
        ...(input.paymentMode !== undefined ? { paymentMode: input.paymentMode as typeof ticketType.paymentMode } : {}),
        ...(input.organizerUpiId !== undefined ? { organizerUpiId: (input.organizerUpiId as string) || null } : {}),
        ...(input.organizerUpiName !== undefined ? { organizerUpiName: (input.organizerUpiName as string) || null } : {}),
        ...(input.organizerUpiQrUploadId !== undefined ? { organizerUpiQrUploadId: (input.organizerUpiQrUploadId as string) || null } : {}),
      },
    });

    await audit({
      actorUserId: user.id,
      entityType: "TicketType",
      entityId: ticketType.id,
      action: "TICKET_TYPE_UPDATED",
      metadata: { eventId: ticketType.eventId, changedFields: Object.keys(input) },
    });

    await revalidateEventById(ticketType.eventId);

    return ok({ ticketType: updated });
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return fail(409, "NAME_TAKEN", "This event already has a ticket type with that name.", {
        name: "Name must be unique within the event",
      });
    }
    return serverError("update ticket type", err);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).ticketTypeId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid ticket type id.");

  const ticketType = await loadOwned(user, idResult.data);
  if (!ticketType) return notFound();

  try {
    // Deleting a ticket type with tickets would orphan attendee records.
    const ticketCount = await prisma.ticket.count({ where: { ticketTypeId: ticketType.id } });
    if (ticketCount > 0) {
      return fail(409, "HAS_TICKETS", "Cannot delete a ticket type that already has tickets.");
    }

    // Payment records reference the ticket type; deleting it would lose the
    // financial trail even when no ticket was ever issued.
    const paymentCount = await prisma.manualPayment.count({
      where: { ticketTypeId: ticketType.id },
    });
    if (paymentCount > 0) {
      return fail(409, "HAS_PAYMENTS", "Cannot delete a ticket type that has payment records.");
    }

    await prisma.ticketType.delete({ where: { id: ticketType.id } });

    await audit({
      actorUserId: user.id,
      entityType: "TicketType",
      entityId: ticketType.id,
      action: "TICKET_TYPE_DELETED",
      metadata: { eventId: ticketType.eventId, name: ticketType.name },
    });

    await revalidateEventById(ticketType.eventId);

    return ok({ deleted: true });
  } catch (err) {
    return serverError("delete ticket type", err);
  }
}
