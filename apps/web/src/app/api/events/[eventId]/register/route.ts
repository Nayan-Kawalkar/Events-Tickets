import { z } from "zod";
import { revalidateEventById } from "@/lib/event-cache";
import { prisma } from "@ct/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ok, fail, parseJson, sameOrigin, serverError, tooManyRequests, unauthorized } from "@/lib/api";
import { sendMail, ticketConfirmationEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { REJECTION_MESSAGES, registerForEvent } from "@/lib/registration";
import { attendeeDetailsSchema, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = attendeeDetailsSchema.extend({ ticketTypeId: uuidSchema }).strict();

type Params = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");
  const eventId = idResult.data;

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { ticketTypeId, ...attendee } = parsed.data;

  // Curb rapid repeat submissions (double-clicks, scripted grabs) per account and IP.
  const ip = await clientIp();
  const byUser = rateLimit(`register-event:user:${user.id}`, 10, 60);
  const byIp = rateLimit(`register-event:ip:${ip}`, 30, 60);
  if (!byUser.ok || !byIp.ok) return tooManyRequests(Math.max(byUser.retryAfter, byIp.retryAfter));

  try {
    const result = await registerForEvent(
      { id: user.id, rollNumber: user.rollNumber },
      eventId,
      ticketTypeId,
      {
        attendeeName: attendee.attendeeName,
        attendeeEmail: attendee.attendeeEmail,
        attendeePhone: attendee.attendeePhone || null,
        attendeeRollNumber: attendee.attendeeRollNumber || null,
        attendeeDepartment: attendee.attendeeDepartment || null,
        customAnswers: attendee.customAnswers ?? {},
      },
    );

    if (!result.ok) {
      // Failures are logged too: refused registrations are the signal that a
      // capacity or eligibility rule is doing its job — or is misconfigured.
      await audit({
        actorUserId: user.id,
        entityType: "Event",
        entityId: eventId,
        action: "REGISTRATION_REJECTED",
        metadata: { ticketTypeId, reason: result.reason },
      });

      // A form problem is the caller's to fix, so it comes back as a 400 with
      // the offending fields named rather than a bare conflict.
      if (result.reason === "FIELDS_INVALID") {
        return fail(400, result.reason, REJECTION_MESSAGES[result.reason], result.fields);
      }

      const status = result.reason === "EVENT_NOT_FOUND" || result.reason === "TICKET_TYPE_NOT_FOUND" ? 404 : 409;
      return fail(status, result.reason, REJECTION_MESSAGES[result.reason]);
    }

    // One seat fewer: the catalogue and detail page both show that count.
    await revalidateEventById(eventId);

    await audit({
      actorUserId: user.id,
      entityType: "Ticket",
      entityId: result.ticket.id,
      action: "TICKET_ISSUED",
      metadata: { eventId, ticketTypeId, publicId: result.ticket.publicId },
    });

    // Confirmation is best-effort and never blocks the issued ticket.
    const details = await prisma.ticket.findUnique({
      where: { id: result.ticket.id },
      select: {
        publicId: true,
        event: { select: { title: true, venue: true, startsAt: true } },
        ticketType: { select: { name: true } },
      },
    });

    if (details) {
      await sendMail(
        ticketConfirmationEmail({
          to: user.email,
          attendeeName: user.fullName,
          eventTitle: details.event.title,
          eventVenue: details.event.venue,
          eventStartsAt: details.event.startsAt,
          ticketTypeName: details.ticketType.name,
          publicId: details.publicId,
        }),
      );
    }

    return ok({ ticket: { publicId: result.ticket.publicId } }, 201);
  } catch (err) {
    return serverError("register for event", err);
  }
}
