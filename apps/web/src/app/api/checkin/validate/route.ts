import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { canUseScanner } from "@/lib/authz";
import { logCheckinAttempt, validateAndConsume } from "@/lib/checkin";
import { ok, fail, forbidden, parseJson, sameOrigin, serverError, tooManyRequests, unauthorized } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z
  .object({
    eventId: uuidSchema,
    gateId: z.string().trim().min(1).max(60).default("DEFAULT"),
    qrPayload: z.string().trim().min(1).max(512),
    deviceId: z.string().trim().max(120).optional(),
  })
  .strict();

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!canUseScanner(user)) return forbidden();

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { eventId, gateId, qrPayload, deviceId } = parsed.data;

  // Generous enough for a busy gate (a scan every ~200ms), tight enough that a
  // stolen scanner session cannot be used to brute-force ticket codes.
  const limit = rateLimit(`checkin:${user.id}`, 300, 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  try {
    const result = await validateAndConsume({ scanner: user, eventId, gateId, qrPayload });

    // Fire-and-forget: the entry decision is made, and the volunteer should not
    // wait a round-trip for the audit row to be written.
    void logCheckinAttempt({ result, scannerUserId: user.id, eventId, gateId, deviceId });

    if (result.status === "APPROVED") {
      return ok({
        status: "APPROVED",
        message: result.message,
        attendee: result.attendee,
        checkedInAt: result.checkedInAt.toISOString(),
      });
    }

    // 200 with a REJECTED body: the request succeeded, the ticket did not.
    // The scanner UI treats this as a normal outcome, not a network error.
    return ok({
      status: "REJECTED",
      reason: result.reason,
      message: result.message,
      // Only ever set for WRONG_EVENT, and only for a scanner already
      // entitled to that event — it names nothing they could not see anyway.
      ...(result.ticketEvent ? { ticketEvent: result.ticketEvent } : {}),
    });
  } catch (err) {
    return serverError("checkin validate", err);
  }
}
