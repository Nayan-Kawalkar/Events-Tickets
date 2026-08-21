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
 * Short-lived cache of the event being scanned.
 *
 * A gate scans one event for hours, so re-reading it on every scan spends a
 * round-trip to say the same thing. Fifteen seconds is short enough that
 * cancelling an event still reaches the gate almost immediately.
 */
type CachedEvent = { id: string; status: EventStatus; createdById: string; cachedAt: number };
const EVENT_CACHE_MS = 15_000;
const eventCache = new Map<string, CachedEvent>();

async function loadEvent(eventId: string): Promise<CachedEvent | null> {
  const hit = eventCache.get(eventId);
  if (hit && Date.now() - hit.cachedAt < EVENT_CACHE_MS) return hit;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, createdById: true },
  });
  if (!event) return null;

  const entry: CachedEvent = { ...event, cachedAt: Date.now() };
  eventCache.set(eventId, entry);
  return entry;
}

type ConsumeRow = {
  id: string;
  attendeeName: string | null;
  attendeeRollNumber: string | null;
  ticketTypeName: string;
  ownerFullName: string;
  ownerRollNumber: string | null;
};

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

  const event = await loadEvent(eventId);
  if (!event) return reject("NOT_AUTHORIZED_FOR_EVENT");

  // A scanner may only check people in at an event they are responsible for.
  const mayScan = scanner.role === Role.ADMIN || event.createdById === scanner.id;
  if (!mayScan) return reject("NOT_AUTHORIZED_FOR_EVENT", { eventId });

  if (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.CLOSED) {
    return reject("EVENT_NOT_LIVE", { eventId });
  }

  const now = new Date();

  const rows = await prisma.$queryRaw<ConsumeRow[]>`
    WITH updated AS (
      UPDATE tickets
      SET status = 'CHECKED_IN'::"TicketStatus",
          "checkedInAt" = ${now},
          "checkedInByUserId" = ${scanner.id}::uuid,
          "checkedInGateId" = ${gateId}
      WHERE "publicId" = ${verified.publicId}
        AND "eventId" = ${eventId}::uuid
        AND status = 'ISSUED'::"TicketStatus"
      RETURNING id, "ticketTypeId", "ownerUserId", "attendeeName", "attendeeRollNumber"
    )
    SELECT u.id,
           u."attendeeName",
           u."attendeeRollNumber",
           tt.name        AS "ticketTypeName",
           o."fullName"   AS "ownerFullName",
           o."rollNumber" AS "ownerRollNumber"
    FROM updated u
    JOIN ticket_types tt ON tt.id = u."ticketTypeId"
    JOIN users o        ON o.id  = u."ownerUserId"
  `;

  const approved = rows[0];
  if (approved) {
    return {
      status: "APPROVED",
      message: "Entry allowed",
      // Only what a volunteer needs to match the person in front of them. The
      // gate checks the name on the ticket, which for a guest pass is not the
      // account holder.
      attendee: {
        name: approved.attendeeName ?? approved.ownerFullName,
        rollNumber: approved.attendeeRollNumber ?? approved.ownerRollNumber,
        ticketType: approved.ticketTypeName,
      },
      checkedInAt: now,
      ticketId: approved.id,
      eventId,
    };
  }

  // Nothing was consumed. Only now pay for a read, to say precisely why.
  return diagnose(scanner, eventId, verified.publicId);
}

/** Explain a failed consume. Runs only on the rejection path. */
async function diagnose(
  scanner: SessionUser,
  eventId: string,
  publicId: string,
): Promise<CheckinResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { publicId },
    select: {
      id: true,
      eventId: true,
      status: true,
      event: { select: { title: true, createdById: true } },
    },
  });

  if (!ticket) return reject("NOT_FOUND", { eventId });

  if (ticket.eventId !== eventId) {
    // Naming the real event turns a dead end into a fix: at a gate this is
    // almost always the scanner left on the wrong event, not a bad ticket.
    const mayKnow = scanner.role === Role.ADMIN || ticket.event.createdById === scanner.id;
    const rejection = reject("WRONG_EVENT", { ticketId: ticket.id, eventId });

    return mayKnow
      ? {
          ...rejection,
          message: `This ticket is for "${ticket.event.title}". Switch the scanner to that event.`,
        }
      : rejection;
  }

  switch (ticket.status) {
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

/** Record the attempt. Never throws: logging must not fail an entry decision. */
export function logCheckinAttempt(params: {
  result: CheckinResult;
  scannerUserId: string;
  eventId: string;
  gateId: string;
  deviceId?: string | null;
}) {
  const { result, scannerUserId, eventId, gateId, deviceId } = params;

  return prisma.checkinAttempt
    .create({
      data: {
        ticketId: result.ticketId ?? null,
        eventId,
        gateId,
        scannerUserId,
        result: result.status,
        reason: result.status === "REJECTED" ? result.reason : null,
        deviceId: deviceId ?? null,
      },
    })
    .then(
      () => undefined,
      (err) => {
        console.error("[checkin] failed to log attempt", err);
      },
    );
}
