import "server-only";
import {
  Prisma,
  prisma,
  EventStatus,
  ManualPaymentStatus,
  PaymentMode,
  TicketStatus,
} from "@ct/db";
import { generateTicketPublicId } from "./registration";
import { LIVE_TICKET_STATUS_LIST } from "./ticket-status";

export type SubmitReason =
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_OPEN"
  | "REGISTRATION_NOT_OPEN"
  | "REGISTRATION_CLOSED"
  | "TICKET_TYPE_NOT_FOUND"
  | "NOT_MANUAL_UPI"
  | "SALES_NOT_OPEN"
  | "SALES_CLOSED"
  | "STUDENT_ID_REQUIRED"
  | "ALREADY_PENDING"
  | "MAX_PER_USER_REACHED"
  | "TICKET_TYPE_SOLD_OUT"
  | "EVENT_FULL";

export const SUBMIT_MESSAGES: Record<SubmitReason, string> = {
  EVENT_NOT_FOUND: "This event is no longer available.",
  EVENT_NOT_OPEN: "This event is not open for registration.",
  REGISTRATION_NOT_OPEN: "Registration for this event has not opened yet.",
  REGISTRATION_CLOSED: "Registration for this event has closed.",
  TICKET_TYPE_NOT_FOUND: "That ticket type is not available.",
  NOT_MANUAL_UPI: "This ticket type does not accept UPI payment.",
  SALES_NOT_OPEN: "This ticket type is not on sale yet.",
  SALES_CLOSED: "Sales for this ticket type have closed.",
  STUDENT_ID_REQUIRED: "Add your roll number to your profile before registering for this ticket.",
  ALREADY_PENDING: "You already have a payment awaiting verification for this ticket type.",
  MAX_PER_USER_REACHED: "You already hold the maximum number of tickets for this ticket type.",
  TICKET_TYPE_SOLD_OUT: "This ticket type is sold out.",
  EVENT_FULL: "This event has reached its capacity.",
};

/**
 * Seats consumed by a ticket type: issued tickets plus payments still awaiting
 * verification. Counting pending claims stops an organizer verifying more
 * payments than there are seats.
 */
async function consumedSeats(
  tx: Prisma.TransactionClient,
  where: { eventId?: string; ticketTypeId?: string },
) {
  const [tickets, pending] = await Promise.all([
    tx.ticket.count({ where: { ...where, status: { in: LIVE_TICKET_STATUS_LIST } } }),
    tx.manualPayment.count({ where: { ...where, status: ManualPaymentStatus.PENDING } }),
  ]);
  return tickets + pending;
}

export type SubmitResult = { ok: true; paymentId: string } | { ok: false; reason: SubmitReason };

/** Record a student's payment claim. Deliberately does NOT create a ticket. */
export async function submitManualPayment(params: {
  user: { id: string; rollNumber: string | null };
  eventId: string;
  ticketTypeId: string;
  upiTransactionId: string | null;
  screenshotUploadId: string | null;
}): Promise<SubmitResult> {
  const { user, eventId, ticketTypeId, upiTransactionId, screenshotUploadId } = params;

  return prisma.$transaction(
    async (tx): Promise<SubmitResult> => {
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

      const ticketType = await tx.ticketType.findUnique({ where: { id: ticketTypeId } });
      if (!ticketType || ticketType.eventId !== event.id) {
        return { ok: false, reason: "TICKET_TYPE_NOT_FOUND" };
      }
      if (ticketType.paymentMode !== PaymentMode.MANUAL_UPI) {
        return { ok: false, reason: "NOT_MANUAL_UPI" };
      }
      if (ticketType.salesStartAt && ticketType.salesStartAt > now) {
        return { ok: false, reason: "SALES_NOT_OPEN" };
      }
      if (ticketType.salesEndAt && ticketType.salesEndAt <= now) {
        return { ok: false, reason: "SALES_CLOSED" };
      }
      if (ticketType.requiresStudentId && !user.rollNumber) {
        return { ok: false, reason: "STUDENT_ID_REQUIRED" };
      }

      // One open claim at a time, so a student cannot flood the review queue.
      const openClaim = await tx.manualPayment.count({
        where: { ticketTypeId, userId: user.id, status: ManualPaymentStatus.PENDING },
      });
      if (openClaim > 0) return { ok: false, reason: "ALREADY_PENDING" };

      const heldByUser = await tx.ticket.count({
        where: { ticketTypeId, ownerUserId: user.id, status: { in: LIVE_TICKET_STATUS_LIST } },
      });
      if (heldByUser >= ticketType.maxPerUser) return { ok: false, reason: "MAX_PER_USER_REACHED" };

      if (ticketType.capacity !== null) {
        const taken = await consumedSeats(tx, { ticketTypeId });
        if (taken >= ticketType.capacity) return { ok: false, reason: "TICKET_TYPE_SOLD_OUT" };
      }
      if (event.capacity !== null) {
        const taken = await consumedSeats(tx, { eventId: event.id });
        if (taken >= event.capacity) return { ok: false, reason: "EVENT_FULL" };
      }

      const payment = await tx.manualPayment.create({
        data: {
          ticketTypeId,
          eventId: event.id,
          userId: user.id,
          // Amount comes from the ticket type, never from the request body.
          amountPaise: ticketType.pricePaise,
          upiTransactionId,
          screenshotUploadId,
          status: ManualPaymentStatus.PENDING,
        },
        select: { id: true },
      });

      return { ok: true, paymentId: payment.id };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
  );
}

export type VerifyReason =
  | "NOT_PENDING"
  | "TICKET_TYPE_SOLD_OUT"
  | "EVENT_FULL"
  | "MAX_PER_USER_REACHED";

export const VERIFY_MESSAGES: Record<VerifyReason, string> = {
  NOT_PENDING: "This payment has already been handled.",
  TICKET_TYPE_SOLD_OUT: "No seats remain for this ticket type. Reject it or free a seat first.",
  EVENT_FULL: "The event is full. Reject it or free a seat first.",
  MAX_PER_USER_REACHED: "This student already holds the maximum tickets for this type.",
};

/** Raised inside the transaction so the VERIFIED write rolls back with it. */
class SeatUnavailable extends Error {
  constructor(public reason: VerifyReason) {
    super(reason);
    this.name = "SeatUnavailable";
  }
}

export type VerifyResult =
  | { ok: true; ticket: { id: string; publicId: string } }
  | { ok: false; reason: VerifyReason };

/**
 * Approve a payment and issue the ticket in one transaction.
 *
 * The `status = PENDING` guard means two organizers clicking Verify at the same
 * moment cannot issue two tickets for one payment.
 */
export async function verifyManualPayment(params: {
  paymentId: string;
  verifierUserId: string;
}): Promise<VerifyResult> {
  const { paymentId, verifierUserId } = params;

  try {
    return await prisma.$transaction(
      async (tx): Promise<VerifyResult> => {
        const claimed = await tx.manualPayment.updateMany({
          where: { id: paymentId, status: ManualPaymentStatus.PENDING },
          data: {
            status: ManualPaymentStatus.VERIFIED,
            verifiedByUserId: verifierUserId,
            verifiedAt: new Date(),
          },
        });
        if (claimed.count === 0) return { ok: false, reason: "NOT_PENDING" };

        const payment = await tx.manualPayment.findUniqueOrThrow({ where: { id: paymentId } });
        const ticketType = await tx.ticketType.findUniqueOrThrow({
          where: { id: payment.ticketTypeId },
        });
        const event = await tx.event.findUniqueOrThrow({ where: { id: payment.eventId } });

        const held = await tx.ticket.count({
          where: {
            ticketTypeId: payment.ticketTypeId,
            ownerUserId: payment.userId,
            status: { in: LIVE_TICKET_STATUS_LIST },
          },
        });
        if (held >= ticketType.maxPerUser) throw new SeatUnavailable("MAX_PER_USER_REACHED");

        if (ticketType.capacity !== null) {
          const sold = await tx.ticket.count({
            where: { ticketTypeId: payment.ticketTypeId, status: { in: LIVE_TICKET_STATUS_LIST } },
          });
          if (sold >= ticketType.capacity) throw new SeatUnavailable("TICKET_TYPE_SOLD_OUT");
        }
        if (event.capacity !== null) {
          const issued = await tx.ticket.count({
            where: { eventId: event.id, status: { in: LIVE_TICKET_STATUS_LIST } },
          });
          if (issued >= event.capacity) throw new SeatUnavailable("EVENT_FULL");
        }

        const ticket = await tx.ticket.create({
          data: {
            publicId: generateTicketPublicId(),
            eventId: payment.eventId,
            ticketTypeId: payment.ticketTypeId,
            ownerUserId: payment.userId,
            status: TicketStatus.ISSUED,
            qrVersion: 1,
          },
          select: { id: true, publicId: true },
        });

        // Links payment to ticket, so a retry cannot issue a second one.
        await tx.manualPayment.update({
          where: { id: paymentId },
          data: { issuedTicketId: ticket.id },
        });

        return { ok: true, ticket };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 },
    );
  } catch (err) {
    // The payment stays PENDING: the organizer can retry or reject it.
    if (err instanceof SeatUnavailable) return { ok: false, reason: err.reason };
    throw err;
  }
}

export async function rejectManualPayment(params: {
  paymentId: string;
  verifierUserId: string;
  reason: string;
}): Promise<{ ok: boolean }> {
  const rejected = await prisma.manualPayment.updateMany({
    where: { id: params.paymentId, status: ManualPaymentStatus.PENDING },
    data: {
      status: ManualPaymentStatus.REJECTED,
      verifiedByUserId: params.verifierUserId,
      verifiedAt: new Date(),
      rejectionReason: params.reason,
    },
  });
  return { ok: rejected.count === 1 };
}
