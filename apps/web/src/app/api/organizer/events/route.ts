import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireOrganizerApi } from "@/lib/organizer-guard";
import { createEventSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const parsed = await parseJson(request, createEventSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  try {
    const event = await prisma.event.create({
      data: {
        title: input.title,
        slug: input.slug,
        description: input.description || null,
        venue: input.venue || null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        registrationOpensAt: input.registrationOpensAt,
        registrationClosesAt: input.registrationClosesAt,
        status: input.status,
        capacity: input.capacity,
        // Ownership is set from the session, never from the request body.
        createdById: user.id,
      },
      select: { id: true, slug: true, title: true, status: true },
    });

    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: event.id,
      action: "EVENT_CREATED",
      metadata: { title: event.title, slug: event.slug, status: event.status },
    });

    return ok({ event }, 201);
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return fail(409, "SLUG_TAKEN", "That URL slug is already in use.", {
        slug: "Another event already uses this slug",
      });
    }
    return serverError("create event", err);
  }
}
