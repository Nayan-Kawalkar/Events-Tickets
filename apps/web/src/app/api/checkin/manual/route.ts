import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canUseScanner } from "@/lib/authz";
import { logCheckinAttempt, manualCheckin } from "@/lib/checkin";
import { ok, fail, forbidden, parseJson, sameOrigin, serverError, tooManyRequests, unauthorized } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    eventId: uuidSchema,
    ticketId: uuidSchema,
    gateId: z.string().trim().min(1).max(60).default("DEFAULT"),
    reason: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .strict();

/**
 * Admit an attendee without scanning: dead phone, broken screen, unreadable QR.
 *
 * Deliberately tighter than the scanner endpoint. The QR signature — the proof
 * that a ticket is genuine — is absent here, so this is an operator decision.
 * It is limited to people who can manage the event, rate-limited well below the
 * scan limit, and recorded in the audit log as well as the scan log.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!canUseScanner(user)) return forbidden();

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { eventId, ticketId, gateId, reason } = parsed.data;

  // A gate scans hundreds of tickets; manual admissions should be a trickle.
  // A spike here is worth noticing rather than silently allowing.
  const limit = rateLimit(`manual-checkin:${user.id}`, 40, 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  try {
    const result = await manualCheckin({ scanner: user, eventId, ticketId, gateId });

    void logCheckinAttempt({
      result,
      scannerUserId: user.id,
      eventId,
      gateId,
      // Marks the row as an admission with no QR behind it.
      deviceId: "MANUAL_ENTRY",
    });

    if (result.status === "APPROVED") {
      await audit({
        actorUserId: user.id,
        entityType: "Ticket",
        // Manual check-in always consumes a real ticket, so this is set.
        entityId: result.ticketId ?? ticketId,
        action: "MANUAL_CHECKIN",
        metadata: {
          eventId,
          gateId,
          attendee: result.attendee.name,
          reason: reason || null,
        },
      });

      return ok({
        status: "APPROVED",
        message: result.message,
        attendee: result.attendee,
        checkedInAt: result.checkedInAt.toISOString(),
      });
    }

    return ok({ status: "REJECTED", reason: result.reason, message: result.message });
  } catch (err) {
    return serverError("manual checkin", err);
  }
}
