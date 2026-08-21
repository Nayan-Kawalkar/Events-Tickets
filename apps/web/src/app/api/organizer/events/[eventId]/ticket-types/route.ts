import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireManageableEvent, requireOrganizerApi } from "@/lib/organizer-guard";
import { createTicketTypeSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  const found = await requireManageableEvent(user, idResult.data);
  if (!found.ok) return found.response;
  const event = found.value;

  const parsed = await parseJson(request, createTicketTypeSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  try {
    // Ticket-type capacities may not over-allocate the event capacity.
    if (event.capacity !== null && input.capacity !== null) {
      const agg = await prisma.ticketType.aggregate({
        where: { eventId: event.id },
        _sum: { capacity: true },
      });
      const allocated = (agg._sum.capacity ?? 0) + input.capacity;
      if (allocated > event.capacity) {
        return fail(409, "OVER_ALLOCATED", "Ticket type capacities exceed the event capacity.", {
          capacity: `Only ${event.capacity - (agg._sum.capacity ?? 0)} seats remain unallocated`,
        });
      }
    }

    const ticketType = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: input.name,
        description: input.description || null,
        pricePaise: input.pricePaise,
        capacity: input.capacity,
        salesStartAt: input.salesStartAt,
        salesEndAt: input.salesEndAt,
        requiresStudentId: input.requiresStudentId,
        transferable: input.transferable,
        maxPerUser: input.maxPerUser,
        paymentMode: input.paymentMode,
        organizerUpiId: input.organizerUpiId || null,
        organizerUpiName: input.organizerUpiName || null,
        organizerUpiQrUploadId: input.organizerUpiQrUploadId || null,
      },
    });

    await audit({
      actorUserId: user.id,
      entityType: "TicketType",
      entityId: ticketType.id,
      action: "TICKET_TYPE_CREATED",
      metadata: { eventId: event.id, name: ticketType.name, pricePaise: ticketType.pricePaise },
    });

    return ok({ ticketType }, 201);
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return fail(409, "NAME_TAKEN", "This event already has a ticket type with that name.", {
        name: "Name must be unique within the event",
      });
    }
    return serverError("create ticket type", err);
  }
}
