import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireManageableEvent, requireOrganizerApi } from "@/lib/organizer-guard";
import { eventHostSchema, uuidSchema } from "@/lib/validation";

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

  const parsed = await parseJson(request, eventHostSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  try {
    // Append to the end of the current list.
    const count = await prisma.eventHost.count({ where: { eventId: event.id } });

    const host = await prisma.eventHost.create({
      data: {
        eventId: event.id,
        name: input.name,
        title: input.title || null,
        email: input.email,
        instagram: input.instagram || null,
        twitter: input.twitter || null,
        linkedin: input.linkedin || null,
        sortOrder: count,
      },
    });

    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: event.id,
      action: "EVENT_UPDATED",
      metadata: { changedFields: ["hosts"], addedHost: host.name },
    });

    return ok({ host }, 201);
  } catch (err) {
    return serverError("add event host", err);
  }
}
