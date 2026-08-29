import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma, prisma, EventStatus, TicketStatus } from "@ct/db";
import { LIVE_TICKET_STATUS_LIST } from "./ticket-status";
import {
  type CustomFieldSpec,
  type FieldErrors,
  labelAnswers,
  validateBuiltIns,
  validateCustomAnswers,
} from "./attendee-fields";

/** Random, unguessable public ticket id. Never sequential. */
export function generateTicketPublicId() {
  return `tkt_${randomBytes(16).toString("base64url")}`;
}

export type RejectionReason =
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_OPEN"
  | "REGISTRATION_NOT_OPEN"
  | "REGISTRATION_CLOSED"
  | "TICKET_TYPE_NOT_FOUND"
  | "SALES_NOT_OPEN"
  | "SALES_CLOSED"
  | "PAID_NOT_SUPPORTED"
  | "NEEDS_APPROVAL"
  | "STUDENT_ID_REQUIRED"
  | "MAX_PER_USER_REACHED"
  | "TICKET_TYPE_SOLD_OUT"
  | "EVENT_FULL"
  | "FIELDS_INVALID";

export const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  EVENT_NOT_FOUND: "This event is no longer available.",
  EVENT_NOT_OPEN: "This event is not open for registration.",
  REGISTRATION_NOT_OPEN: "Registration for this event has not opened yet.",
  REGISTRATION_CLOSED: "Registration for this event has closed.",
  TICKET_TYPE_NOT_FOUND: "That ticket type is not available.",
  SALES_NOT_OPEN: "This ticket type is not on sale yet.",
  SALES_CLOSED: "Sales for this ticket type have closed.",
  PAID_NOT_SUPPORTED: "Paid tickets are not available yet. Please check back later.",
  NEEDS_APPROVAL:
    "This ticket needs the organizer's approval. Use the request form on the event page.",
  STUDENT_ID_REQUIRED: "Add your roll number to your profile before registering for this ticket.",
  MAX_PER_USER_REACHED: "You already hold the maximum number of tickets for this ticket type.",
  TICKET_TYPE_SOLD_OUT: "This ticket type is sold out.",
  EVENT_FULL: "This event has reached its capacity.",
  FIELDS_INVALID: "Please check the highlighted fields.",
};

export type RegistrationResult =
  | { ok: true; ticket: { id: string; publicId: string } }
  | { ok: false; reason: RejectionReason; fields?: FieldErrors };

type Actor = { id: string; rollNumber: string | null };

/** Buyer-supplied details, stored on the ticket at issue time. */
export type AttendeeSnapshot = {
  attendeeName: string;
  attendeeEmail: string;
  attendeePhone?: string | null;
  attendeeRollNumber?: string | null;
  attendeeDepartment?: string | null;
  customAnswers?: Record<string, string>;
};

/**
 * Register a user for one ticket of a given type.
 *
 * Every eligibility check runs inside a serializable transaction together with
 * the insert, so two requests arriving at the same moment cannot both consume
 * the last seat. Postgres aborts one of them with a serialization failure, which
 * the caller retries.
 */
async function attemptRegistration(
  user: Actor,
  eventId: string,
  ticketTypeId: string,
  attendee: AttendeeSnapshot,
): Promise<RegistrationResult> {
  return prisma.$transaction(
    async (tx): Promise<RegistrationResult> => {
      const now = new Date();

      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (!event) return { ok: false, reason: "EVENT_NOT_FOUND" };
      if (event.status !== EventStatus.PUBLISHED) return { ok: false, reason: "EVENT_NOT_OPEN" };
      if (event.registrationOpensAt && event.registrationOpensAt > now) {
        return { ok: false, reason: "REGISTRATION_NOT_OPEN" };
      }
      if (event.registrationClosesAt && event.registrationClosesAt <= now) {
        return { ok: false, reason: "REGISTRATION_CLOSED" };
      }

      const ticketType = await tx.ticketType.findUnique({
        where: { id: ticketTypeId },
        include: { customFields: { orderBy: { sortOrder: "asc" } } },
      });
      // Guard the ticket type belongs to this event — the ids arrive from the client.
      if (!ticketType || ticketType.eventId !== event.id) {
        return { ok: false, reason: "TICKET_TYPE_NOT_FOUND" };
      }
      if (ticketType.salesStartAt && ticketType.salesStartAt > now) {
        return { ok: false, reason: "SALES_NOT_OPEN" };
      }
      if (ticketType.salesEndAt && ticketType.salesEndAt <= now) {
        return { ok: false, reason: "SALES_CLOSED" };
      }

      // Paid tickets must go through a verified payment before a ticket exists.
      // Until that phase lands, refuse rather than issue something for free.
      if (ticketType.pricePaise > 0) return { ok: false, reason: "PAID_NOT_SUPPORTED" };

      // Free, but the organizer vets each person. Issuing straight away here
      // would defeat the whole point, so the request goes to the review queue
      // instead — the same one paid claims use.
      if (ticketType.requiresApproval) return { ok: false, reason: "NEEDS_APPROVAL" };

      // The form is whatever this ticket type asks for. Validated here, on the
      // server, against the same description the browser rendered from — a
      // required field the client skipped is caught, and a hidden field the
      // client invented is dropped rather than stored.
      const spec = {
        phoneMode: ticketType.phoneMode,
        rollNumberMode: ticketType.rollNumberMode,
        departmentMode: ticketType.departmentMode,
        customFields: ticketType.customFields as CustomFieldSpec[],
      };

      const builtIns = validateBuiltIns(spec, {
        attendeePhone: attendee.attendeePhone ?? "",
        attendeeRollNumber: attendee.attendeeRollNumber ?? "",
        attendeeDepartment: attendee.attendeeDepartment ?? "",
      });
      if (!builtIns.ok) return { ok: false, reason: "FIELDS_INVALID", fields: builtIns.errors };

      const custom = validateCustomAnswers(spec.customFields, attendee.customAnswers ?? {});
      if (!custom.ok) return { ok: false, reason: "FIELDS_INVALID", fields: custom.errors };

      // A student ticket must still name a student, whichever way the roll
      // number was configured.
      if (ticketType.requiresStudentId && !builtIns.values.attendeeRollNumber && !user.rollNumber) {
        return { ok: false, reason: "STUDENT_ID_REQUIRED" };
      }

      const heldByUser = await tx.ticket.count({
        where: {
          ticketTypeId: ticketType.id,
          ownerUserId: user.id,
          status: { in: LIVE_TICKET_STATUS_LIST },
        },
      });
      if (heldByUser >= ticketType.maxPerUser) {
        return { ok: false, reason: "MAX_PER_USER_REACHED" };
      }

      if (ticketType.capacity !== null) {
        const sold = await tx.ticket.count({
          where: { ticketTypeId: ticketType.id, status: { in: LIVE_TICKET_STATUS_LIST } },
        });
        if (sold >= ticketType.capacity) return { ok: false, reason: "TICKET_TYPE_SOLD_OUT" };
      }

      if (event.capacity !== null) {
        const issued = await tx.ticket.count({
          where: { eventId: event.id, status: { in: LIVE_TICKET_STATUS_LIST } },
        });
        if (issued >= event.capacity) return { ok: false, reason: "EVENT_FULL" };
      }

      const ticket = await tx.ticket.create({
        data: {
          publicId: generateTicketPublicId(),
          eventId: event.id,
          ticketTypeId: ticketType.id,
          ownerUserId: user.id,
          status: TicketStatus.ISSUED,
          qrVersion: 1,
          attendeeName: attendee.attendeeName,
          attendeeEmail: attendee.attendeeEmail,
          attendeePhone: builtIns.values.attendeePhone,
          attendeeRollNumber: builtIns.values.attendeeRollNumber || user.rollNumber || null,
          attendeeDepartment: builtIns.values.attendeeDepartment,
          // Stored with the label as it read at purchase, so an edited or
          // deleted question never rewrites an answer already given.
          customAnswers: labelAnswers(spec.customFields, custom.answers),
          termsAcceptedAt: new Date(),
        },
        select: { id: true, publicId: true },
      });

      return { ok: true, ticket };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
  );
}

/** Postgres aborts one of two conflicting serializable transactions; retrying it is expected. */
function isSerializationFailure(err: unknown) {
  const code = (err as { code?: string })?.code;
  // P2034: Prisma's "transaction failed due to a write conflict or deadlock".
  // 40001 serialization_failure, 40P01 deadlock_detected.
  return code === "P2034" || code === "40001" || code === "40P01";
}

export async function registerForEvent(
  user: Actor,
  eventId: string,
  ticketTypeId: string,
  attendee: AttendeeSnapshot,
): Promise<RegistrationResult> {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await attemptRegistration(user, eventId, ticketTypeId, attendee);
    } catch (err) {
      if (isSerializationFailure(err) && attempt < MAX_ATTEMPTS) {
        // Brief, growing backoff so the retries do not collide again immediately.
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
        continue;
      }
      throw err;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error("registerForEvent: exhausted retries");
}
