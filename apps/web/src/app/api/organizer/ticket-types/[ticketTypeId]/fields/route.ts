import { prisma } from "@ct/db";
import { hasOptions } from "@/lib/attendee-fields";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { revalidateEventById } from "@/lib/event-cache";
import { requireManageableEvent, requireOrganizerApi } from "@/lib/organizer-guard";
import { customFieldsSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ ticketTypeId: string }> };

/**
 * Replace the questions on one ticket type.
 *
 * The whole set arrives at once, which is how the editor works: rows are added,
 * removed and reordered locally and saved together. Existing rows keep their id
 * so an answer already collected still lines up with the question that produced
 * it; rows that disappear are deleted.
 *
 * Deleting a question never touches tickets: answers are stored on the ticket
 * with the label they were given under, so an attendee list collected last week
 * survives the organizer tidying the form today.
 */
export async function PUT(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).ticketTypeId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid ticket type id.");

  const ticketType = await prisma.ticketType.findUnique({
    where: { id: idResult.data },
    select: { id: true, eventId: true, name: true },
  });
  if (!ticketType) return fail(404, "NOT_FOUND", "Ticket type not found.");

  // Ownership is decided by the event, so a guessed ticket-type id gets nowhere.
  const found = await requireManageableEvent(user, ticketType.eventId);
  if (!found.ok) return found.response;

  const parsed = await parseJson(request, customFieldsSchema);
  if (!parsed.ok) return parsed.response;
  const incoming = parsed.data.fields;

  // Labels are what an organizer reads on the attendee list; two identical ones
  // make an export ambiguous.
  const labels = incoming.map((f) => f.label.toLowerCase());
  const duplicate = labels.find((l, i) => labels.indexOf(l) !== i);
  if (duplicate) {
    return fail(409, "DUPLICATE_LABEL", `Two questions share the label "${duplicate}".`);
  }

  try {
    const existing = await prisma.ticketTypeField.findMany({
      where: { ticketTypeId: ticketType.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((f) => f.id));
    const keptIds = new Set(incoming.map((f) => f.id).filter((id): id is string => Boolean(id)));

    // An id we do not recognise would otherwise create a row belonging to
    // another ticket type's question.
    for (const id of keptIds) {
      if (!existingIds.has(id)) return fail(400, "UNKNOWN_FIELD", "Unknown question id.");
    }

    await prisma.$transaction(async (tx) => {
      const removed = [...existingIds].filter((id) => !keptIds.has(id));
      if (removed.length) {
        await tx.ticketTypeField.deleteMany({ where: { id: { in: removed } } });
      }

      for (const [index, field] of incoming.entries()) {
        const data = {
          label: field.label,
          helpText: field.helpText || null,
          placeholder: field.placeholder || null,
          type: field.type,
          required: field.required,
          // Options only mean anything for a dropdown; clear them otherwise so a
          // type change does not leave stale choices behind.
          options: hasOptions(field.type) ? field.options : [],
          sortOrder: index,
        };

        if (field.id) {
          await tx.ticketTypeField.update({ where: { id: field.id }, data });
        } else {
          await tx.ticketTypeField.create({ data: { ...data, ticketTypeId: ticketType.id } });
        }
      }
    });

    await audit({
      actorUserId: user.id,
      entityType: "TicketType",
      entityId: ticketType.id,
      action: "TICKET_TYPE_UPDATED",
      metadata: { form: true, questionCount: incoming.length, name: ticketType.name },
    });

    await revalidateEventById(ticketType.eventId);

    const fields = await prisma.ticketTypeField.findMany({
      where: { ticketTypeId: ticketType.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, helpText: true,
            placeholder: true, type: true, required: true, options: true },
    });

    return ok({ fields });
  } catch (err) {
    return serverError("save ticket type fields", err);
  }
}
