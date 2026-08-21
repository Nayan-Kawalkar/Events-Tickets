import { UploadKind } from "@ct/db";
import { audit } from "@/lib/audit";
import { fail, ok, sameOrigin, serverError, tooManyRequests } from "@/lib/api";
import { requireOrganizerApi } from "@/lib/organizer-guard";
import { rateLimit } from "@/lib/rate-limit";
import { storeUpload, UPLOAD_FAILURE_MESSAGES } from "@/lib/uploads";

export const runtime = "nodejs";

/**
 * Upload an organizer asset: an event poster or a UPI QR image.
 *
 * Payment screenshots do NOT come through here — they are attached to the
 * payment submission itself, so an upload cannot exist without a claim.
 */
const ALLOWED_KINDS = new Set<string>([UploadKind.EVENT_POSTER, UploadKind.UPI_QR]);
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const limit = rateLimit(`upload:${user.id}`, 20, 60 * 10);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "INVALID_BODY", "Expected a multipart form submission.");
  }

  try {
    // Only the two organizer-owned kinds may be created here; a caller cannot
    // mint a PAYMENT_PROOF and attach it to someone else's claim.
    const requestedKind = String(form.get("kind") ?? UploadKind.UPI_QR);
    if (!ALLOWED_KINDS.has(requestedKind)) {
      return fail(422, "VALIDATION_FAILED", "Unsupported upload type.");
    }

    const stored = await storeUpload({
      file: form.get("file"),
      kind: requestedKind as UploadKind,
      uploadedById: user.id,
    });

    if (!stored.ok) {
      return fail(422, "VALIDATION_FAILED", UPLOAD_FAILURE_MESSAGES[stored.reason], {
        file: UPLOAD_FAILURE_MESSAGES[stored.reason],
      });
    }

    await audit({
      actorUserId: user.id,
      entityType: "Upload",
      entityId: stored.uploadId,
      action: requestedKind === UploadKind.EVENT_POSTER ? "EVENT_POSTER_UPLOADED" : "UPI_QR_UPLOADED",
      metadata: { sizeBytes: stored.sizeBytes, mimeType: stored.mimeType },
    });

    return ok({ uploadId: stored.uploadId }, 201);
  } catch (err) {
    return serverError("upload", err);
  }
}
