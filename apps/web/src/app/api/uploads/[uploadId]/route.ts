import { prisma, ManualPaymentStatus, Role, UploadKind } from "@ct/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/authz";
import { fail, notFound, unauthorized, serverError } from "@/lib/api";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ uploadId: string }> };

/**
 * Serve a stored image.
 *
 * A UPI QR is shown to any signed-in user (they need it to pay). A payment
 * screenshot is private: only the student who uploaded it and someone who can
 * manage the event may see it.
 */
export async function GET(_request: Request, { params }: Params) {
  const idResult = uuidSchema.safeParse((await params).uploadId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid upload id.");

  try {
    const upload = await prisma.upload.findUnique({
      where: { id: idResult.data },
      select: { id: true, kind: true, mimeType: true, data: true, uploadedById: true },
    });
    if (!upload) return notFound();

    // Posters and host headshots are public: both render on pages a
    // signed-out visitor can see, so requiring a session would break them.
    if (upload.kind === UploadKind.EVENT_POSTER || upload.kind === UploadKind.HOST_AVATAR) {
      return new Response(Buffer.from(upload.data), {
        headers: {
          "Content-Type": upload.mimeType,
          "Content-Disposition": "inline",
          // Content is immutable per id, so it can be cached hard.
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const user = await getCurrentUser();
    if (!user) return unauthorized();

    if (upload.kind === UploadKind.PAYMENT_PROOF) {
      const isUploader = upload.uploadedById === user.id;

      let mayReview = user.role === Role.ADMIN;
      if (!mayReview && !isUploader) {
        const payment = await prisma.manualPayment.findFirst({
          where: { screenshotUploadId: upload.id },
          select: { event: { select: { createdById: true } } },
        });
        mayReview = payment ? canManageEvent(user, payment.event) : false;
      }

      // Same response for "not yours" as for "does not exist".
      if (!isUploader && !mayReview) return notFound();
    }

    return new Response(Buffer.from(upload.data), {
      headers: {
        "Content-Type": upload.mimeType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return serverError("serve upload", err);
  }
}
