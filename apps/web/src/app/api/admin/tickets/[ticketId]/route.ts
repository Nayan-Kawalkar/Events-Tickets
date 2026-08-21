import { z } from "zod";
import { prisma, TicketStatus } from "@ct/db";
import { audit } from "@/lib/audit";
import { ok, fail, notFound, parseJson, sameOrigin, serverError } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin-guard";
import { generateTicketPublicId } from "@/lib/registration";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    action: z.enum(["BLOCK", "CANCEL", "REINSTATE", "REISSUE"]),
    reason: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .strict();

type Params = { params: Promise<{ ticketId: string }> };

/** Ticket support actions: block, cancel, reinstate, or reissue after loss. */
export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const admin = guard.value;

  const idResult = uuidSchema.safeParse((await params).ticketId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid ticket id.");

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { action, reason } = parsed.data;

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
        publicId: true,
        status: true,
        eventId: true,
        ticketTypeId: true,
        ownerUserId: true,
      },
    });
    if (!ticket) return notFound();

    if (action === "REISSUE") {
      // Invalidate the old ticket and mint a new one in one transaction, so a
      // lost phone can never leave two usable QRs in circulation.
      const result = await prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { status: TicketStatus.CANCELLED },
        });

        return tx.ticket.create({
          data: {
            publicId: generateTicketPublicId(),
            eventId: ticket.eventId,
            ticketTypeId: ticket.ticketTypeId,
            ownerUserId: ticket.ownerUserId,
            status: TicketStatus.ISSUED,
            qrVersion: 1,
          },
          select: { id: true, publicId: true },
        });
      });

      await audit({
        actorUserId: admin.id,
        entityType: "Ticket",
        entityId: ticket.id,
        action: "ADMIN_TICKET_REISSUED",
        metadata: {
          reason: reason || null,
          oldPublicId: ticket.publicId,
          newTicketId: result.id,
          newPublicId: result.publicId,
        },
      });

      return ok({ ticket: result });
    }

    const nextStatus =
      action === "BLOCK"
        ? TicketStatus.BLOCKED
        : action === "CANCEL"
          ? TicketStatus.CANCELLED
          : TicketStatus.ISSUED;

    if (action === "REINSTATE") {
      // A ticket already used at a gate must not silently become valid again.
      if (ticket.status === TicketStatus.CHECKED_IN) {
        return fail(
          409,
          "ALREADY_CHECKED_IN",
          "This ticket was already used at a gate. Reissue it instead so the check-in record stays intact.",
        );
      }

      // Reissue cancels a ticket and mints a replacement. Reinstating the
      // cancelled one while its replacement is still live would put two working
      // QRs into circulation for one registration — two people could enter.
      const liveReplacement = await prisma.ticket.findFirst({
        where: {
          id: { not: ticket.id },
          eventId: ticket.eventId,
          ticketTypeId: ticket.ticketTypeId,
          ownerUserId: ticket.ownerUserId,
          status: { in: [TicketStatus.ISSUED, TicketStatus.CHECKED_IN] },
        },
        select: { publicId: true, status: true },
      });

      if (liveReplacement) {
        return fail(
          409,
          "REPLACEMENT_EXISTS",
          `This attendee already holds a live ticket (${liveReplacement.publicId}, ${liveReplacement.status.toLowerCase()}). Cancel or block that one first — reinstating this would leave two usable QRs for one registration.`,
        );
      }
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: nextStatus },
      select: { id: true, publicId: true, status: true },
    });

    await audit({
      actorUserId: admin.id,
      entityType: "Ticket",
      entityId: ticket.id,
      action:
        action === "BLOCK"
          ? "ADMIN_TICKET_BLOCKED"
          : action === "CANCEL"
            ? "ADMIN_TICKET_CANCELLED"
            : "ADMIN_TICKET_REINSTATED",
      metadata: { publicId: ticket.publicId, from: ticket.status, to: nextStatus, reason: reason || null },
    });

    return ok({ ticket: updated });
  } catch (err) {
    return serverError("admin ticket action", err);
  }
}
