import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { countLiveTickets, requireManageableEvent, requireOrganizerApi } from "@/lib/organizer-guard";
import { updateEventSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  const found = await requireManageableEvent(user, idResult.data);
  if (!found.ok) return found.response;
  const event = found.value;

  const parsed = await parseJson(request, updateEventSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data as Record<string, unknown>;

  // Cross-field rules need the merged record, since PATCH may change only one date.
  const merged = { ...event, ...input } as typeof event;
  if (merged.endsAt <= merged.startsAt) {
    return fail(422, "VALIDATION_FAILED", "Please correct the highlighted fields.", {
      endsAt: "End time must be after the start time",
    });
  }
  if (
    merged.registrationOpensAt &&
    merged.registrationClosesAt &&
    merged.registrationClosesAt <= merged.registrationOpensAt
  ) {
    return fail(422, "VALIDATION_FAILED", "Please correct the highlighted fields.", {
      registrationClosesAt: "Registration must close after it opens",
    });
  }

  try {
    // Capacity may not drop below tickets already issued, nor below the sum of
    // ticket-type capacities.
    if ("capacity" in input && merged.capacity !== null) {
      const issued = await countLiveTickets({ eventId: event.id });
      if (merged.capacity < issued) {
        return fail(409, "CAPACITY_BELOW_SOLD", "Capacity cannot be lower than tickets already issued.", {
          capacity: `${issued} ticket(s) already issued`,
        });
      }

      const agg = await prisma.ticketType.aggregate({
        where: { eventId: event.id },
        _sum: { capacity: true },
      });
      const allocated = agg._sum.capacity ?? 0;
      if (allocated > merged.capacity) {
        return fail(409, "CAPACITY_BELOW_ALLOCATION", "Ticket types already allocate more seats than this.", {
          capacity: `Ticket types allocate ${allocated} seats`,
        });
      }
    }

    const updated = await prisma.event.update({
      where: { id: event.id },
      data: {
        ...(input.title !== undefined ? { title: input.title as string } : {}),
        ...(input.slug !== undefined ? { slug: input.slug as string } : {}),
        ...(input.description !== undefined ? { description: (input.description as string) || null } : {}),
        ...(input.venue !== undefined ? { venue: (input.venue as string) || null } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt as Date } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt as Date } : {}),
        ...(input.registrationOpensAt !== undefined
          ? { registrationOpensAt: input.registrationOpensAt as Date | null }
          : {}),
        ...(input.registrationClosesAt !== undefined
          ? { registrationClosesAt: input.registrationClosesAt as Date | null }
          : {}),
        ...(input.status !== undefined ? { status: input.status as typeof event.status } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity as number | null } : {}),
      },
      select: { id: true, slug: true, title: true, status: true },
    });

    const changed = Object.keys(input);
    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: event.id,
      action: input.status !== undefined && changed.length === 1 ? "EVENT_STATUS_CHANGED" : "EVENT_UPDATED",
      metadata: {
        changedFields: changed,
        ...(input.status !== undefined ? { from: event.status, to: input.status } : {}),
      },
    });

    return ok({ event: updated });
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return fail(409, "SLUG_TAKEN", "That URL slug is already in use.", {
        slug: "Another event already uses this slug",
      });
    }
    return serverError("update event", err);
  }
}
