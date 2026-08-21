import "server-only";
import { prisma, EventStatus, Role, TicketStatus } from "@ct/db";
import type { SessionUser } from "./auth";
import { verifyQrPayload } from "./qr";

export type RejectReason =
  | "INVALID"
  | "INVALID_SIGNATURE"
  | "EXPIRED"
  | "NOT_FOUND"
  | "WRONG_EVENT"
  | "ALREADY_USED"
  | "CANCELLED"
  | "BLOCKED"
  | "EVENT_NOT_LIVE"
  | "NOT_AUTHORIZED_FOR_EVENT";

export type CheckinResult =
  | {
      status: "APPROVED";
      message: string;
      attendee: { name: string; rollNumber: string | null; ticketType: string };
      checkedInAt: Date;
      ticketId: string;
      eventId: string;
    }
  | {
      status: "REJECTED";
      reason: RejectReason;
      message: string;
      ticketId?: string;
      eventId?: string;
    };

const REJECT_MESSAGES: Record<RejectReason, string> = {
  INVALID: "This code is not a valid ticket.",
  INVALID_SIGNATURE: "This ticket has been altered or was not issued by us.",
  EXPIRED: "This ticket has expired.",
  NOT_FOUND: "This ticket does not exist.",
  WRONG_EVENT: "This ticket is for a different event.",
  ALREADY_USED: "This ticket was already checked in.",
  CANCELLED: "This ticket was cancelled.",
  BLOCKED: "This ticket is blocked. Send the attendee to the help desk.",
  EVENT_NOT_LIVE: "This event is not open for entry.",
  NOT_AUTHORIZED_FOR_EVENT: "You are not assigned to this event.",
};

function reject(reason: RejectReason, extra?: { ticketId?: string; eventId?: string }): CheckinResult {
  return { status: "REJECTED", reason, message: REJECT_MESSAGES[reason], ...extra };
}

/**
 * Validate a scanned payload and consume the ticket.
 *
 * The consuming write is a single conditional UPDATE guarded on
 * `status = 'ISSUED'`. If two gates scan the same ticket at the same instant,
 * exactly one UPDATE matches a row; the other sees zero rows affected and is
 * told ALREADY_USED. No read-then-write race exists, so no locking is needed.
 */
export async function validateAndConsume(params: {
  scanner: SessionUser;
  eventId: string;
  gateId: string;
  qrPayload: string;
}): Promise<CheckinResult> {
  const { scanner, eventId, gateId, qrPayload } = params;

  const verified = verifyQrPayload(qrPayload);
  if (!verified.ok) {
    if (verified.reason === "INVALID_SIGNATURE") return reject("INVALID_SIGNATURE", { eventId });
    if (verified.reason === "EXPIRED") return reject("EXPIRED", { eventId });
    return reject("INVALID", { eventId });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, createdById: true },
  });
  if (!event) return reject("NOT_AUTHORIZED_FOR_EVENT");

  // A scanner may only check people in at an event they are responsible for.
  const mayScan = scanner.role === Role.ADMIN || event.createdById === scanner.id;
  if (!mayScan) return reject("NOT_AUTHORIZED_FOR_EVENT", { eventId });

  if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.CLOSED) {
    return reject("EVENT_NOT_LIVE", { eventId });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { publicId: verified.publicId },
    select: { id: true, eventId: true, status: true },
  });
  if (!ticket) return reject("NOT_FOUND", { eventId });
  if (ticket.eventId !== eventId) return reject("WRONG_EVENT", { ticketId: ticket.id, eventId });

  const now = new Date();

  // The one write that matters. Only an ISSUED ticket can transition.
  const consumed = await prisma.ticket.updateMany({
    where: { id: ticket.id, eventId, status: TicketStatus.ISSUED },
    data: {
      status: TicketStatus.CHECKED_IN,
      checkedInAt: now,
      checkedInByUserId: scanner.id,
      checkedInGateId: gateId,
    },
  });

  if (consumed.count === 0) {
    // Lost the race, or the ticket was never usable. Re-read to say which.
    const current = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true },
    });

    switch (current?.status) {
      case TicketStatus.CHECKED_IN:
        return reject("ALREADY_USED", { ticketId: ticket.id, eventId });
      case TicketStatus.CANCELLED:
        return reject("CANCELLED", { ticketId: ticket.id, eventId });
      case TicketStatus.BLOCKED:
        return reject("BLOCKED", { ticketId: ticket.id, eventId });
      case TicketStatus.EXPIRED:
        return reject("EXPIRED", { ticketId: ticket.id, eventId });
      default:
        return reject("INVALID", { ticketId: ticket.id, eventId });
    }
  }

  const details = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    select: {
      owner: { select: { fullName: true, rollNumber: true } },
      ticketType: { select: { name: true } },
    },
  });

  return {
    status: "APPROVED",
    message: "Entry allowed",
    // Only what a volunteer needs to match the person in front of them.
    attendee: {
      name: details?.owner.fullName ?? "Attendee",
      rollNumber: details?.owner.rollNumber ?? null,
      ticketType: details?.ticketType.name ?? "Ticket",
    },
    checkedInAt: now,
    ticketId: ticket.id,
    eventId,
  };
}

/** Record the attempt. Never throws: logging must not fail an entry decision. */
export async function logCheckinAttempt(params: {
  result: CheckinResult;
  scannerUserId: string;
  eventId: string;
  gateId: string;
  deviceId?: string | null;
}) {
  const { result, scannerUserId, eventId, gateId, deviceId } = params;

  try {
    await prisma.checkinAttempt.create({
      data: {
        ticketId: result.status === "APPROVED" ? result.ticketId : (result.ticketId ?? null),
        eventId,
        gateId,
        scannerUserId,
        result: result.status,
        reason: result.status === "REJECTED" ? result.reason : null,
        deviceId: deviceId ?? null,
      },
    });
  } catch (err) {
    console.error("[checkin] failed to log attempt", err);
  }
}
