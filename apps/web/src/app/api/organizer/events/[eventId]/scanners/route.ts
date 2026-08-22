import { z } from "zod";
import { prisma, Role } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireManageableEvent, requireOrganizerApi } from "@/lib/organizer-guard";
import { emailSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    email: emailSchema,
    gateId: z.string().trim().max(60).optional().or(z.literal("")),
  })
  .strict();

type Params = { params: Promise<{ eventId: string }> };

/**
 * Assign a volunteer to scan this event.
 *
 * Assignment is by existing account, never by creating one: the person signs up
 * themselves, and the organizer grants access to their event only. The account
 * is promoted to SCANNER if it is still a plain student, but an ORGANIZER or
 * ADMIN is never demoted by being assigned a gate.
 */
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

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { email, gateId } = parsed.data;

  try {
    const volunteer = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, role: true },
    });

    if (!volunteer) {
      return fail(404, "NO_SUCH_USER", "No account with that email. Ask them to sign up first.", {
        email: "Not registered yet",
      });
    }

    const assignment = await prisma.$transaction(async (tx) => {
      // A student working a gate becomes a SCANNER; staff keep their role.
      if (volunteer.role === Role.STUDENT) {
        await tx.user.update({ where: { id: volunteer.id }, data: { role: Role.SCANNER } });
      }

      return tx.scannerAssignment.upsert({
        where: { userId_eventId: { userId: volunteer.id, eventId: event.id } },
        create: {
          userId: volunteer.id,
          eventId: event.id,
          gateId: gateId || null,
          assignedByUserId: user.id,
        },
        update: { gateId: gateId || null },
        select: { id: true, gateId: true },
      });
    });

    await audit({
      actorUserId: user.id,
      entityType: "Event",
      entityId: event.id,
      action: "SCANNER_ASSIGNED",
      metadata: { volunteer: volunteer.email, gateId: gateId || null },
    });

    return ok({ assignment, volunteer: { fullName: volunteer.fullName, email: volunteer.email } }, 201);
  } catch (err) {
    return serverError("assign scanner", err);
  }
}
