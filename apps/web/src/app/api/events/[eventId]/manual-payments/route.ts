import { UploadKind } from "@ct/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fail, ok, sameOrigin, serverError, tooManyRequests, unauthorized } from "@/lib/api";
import { sendMail, paymentReceivedEmail } from "@/lib/email";
import { SUBMIT_MESSAGES, submitManualPayment } from "@/lib/manual-payment";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { storeUpload, UPLOAD_FAILURE_MESSAGES } from "@/lib/uploads";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventId: string }> };

/** Student submits proof of a UPI payment. Creates a claim, never a ticket. */
export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  const ip = await clientIp();
  const byUser = rateLimit(`manual-pay:user:${user.id}`, 6, 60 * 10);
  const byIp = rateLimit(`manual-pay:ip:${ip}`, 20, 60 * 10);
  if (!byUser.ok || !byIp.ok) return tooManyRequests(Math.max(byUser.retryAfter, byIp.retryAfter));

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_BODY", "Expected a multipart form submission.");
  }

  const ticketTypeResult = uuidSchema.safeParse(form.get("ticketTypeId"));
  if (!ticketTypeResult.success) {
    return fail(422, "VALIDATION_FAILED", "Choose a ticket type.", {
      ticketTypeId: "Invalid ticket type",
    });
  }

  const utrRaw = String(form.get("upiTransactionId") ?? "").trim();
  if (utrRaw.length > 40) {
    return fail(422, "VALIDATION_FAILED", "Check the reference number.", {
      upiTransactionId: "Reference number is too long",
    });
  }

  try {
    // Screenshot is optional but strongly encouraged by the UI.
    let screenshotUploadId: string | null = null;
    const file = form.get("screenshot");
    if (file instanceof File && file.size > 0) {
      const stored = await storeUpload({
        file,
        kind: UploadKind.PAYMENT_PROOF,
        uploadedById: user.id,
      });
      if (!stored.ok) {
        return fail(422, "VALIDATION_FAILED", UPLOAD_FAILURE_MESSAGES[stored.reason], {
          screenshot: UPLOAD_FAILURE_MESSAGES[stored.reason],
        });
      }
      screenshotUploadId = stored.uploadId;
    }

    const result = await submitManualPayment({
      user: { id: user.id, rollNumber: user.rollNumber },
      eventId: idResult.data,
      ticketTypeId: ticketTypeResult.data,
      upiTransactionId: utrRaw || null,
      screenshotUploadId,
    });

    if (!result.ok) {
      await audit({
        actorUserId: user.id,
        entityType: "Event",
        entityId: idResult.data,
        action: "MANUAL_PAYMENT_REJECTED_AT_SUBMIT",
        metadata: { ticketTypeId: ticketTypeResult.data, reason: result.reason },
      });
      return fail(409, result.reason, SUBMIT_MESSAGES[result.reason]);
    }

    await audit({
      actorUserId: user.id,
      entityType: "ManualPayment",
      entityId: result.paymentId,
      action: "MANUAL_PAYMENT_SUBMITTED",
      metadata: {
        eventId: idResult.data,
        ticketTypeId: ticketTypeResult.data,
        hasScreenshot: Boolean(screenshotUploadId),
        hasUtr: Boolean(utrRaw),
      },
    });

    await sendMail(paymentReceivedEmail({ to: user.email, attendeeName: user.fullName }));

    return ok({ paymentId: result.paymentId }, 201);
  } catch (err) {
    return serverError("submit manual payment", err);
  }
}
