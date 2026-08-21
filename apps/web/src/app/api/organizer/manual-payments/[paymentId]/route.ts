import { z } from "zod";
import { prisma } from "@ct/db";
import { audit } from "@/lib/audit";
import { canManageEvent } from "@/lib/authz";
import { fail, notFound, ok, parseJson, sameOrigin, serverError } from "@/lib/api";
import { sendMail, paymentRejectedEmail, ticketConfirmationEmail } from "@/lib/email";
import {
  VERIFY_MESSAGES,
  rejectManualPayment,
  verifyManualPayment,
} from "@/lib/manual-payment";
import { requireOrganizerApi } from "@/lib/organizer-guard";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("VERIFY") }).strict(),
    z
      .object({
        action: z.literal("REJECT"),
        reason: z.string().trim().min(3, "Give a short reason").max(300),
      })
      .strict(),
  ]);

type Params = { params: Promise<{ paymentId: string }> };

export async function POST(request: Request, { params }: Params) {
  if (!sameOrigin(request)) return fail(403, "BAD_ORIGIN", "Request origin not allowed.");

  const guard = await requireOrganizerApi();
  if (!guard.ok) return guard.response;
  const user = guard.value;

  const idResult = uuidSchema.safeParse((await params).paymentId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid payment id.");

  const parsed = await parseJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const payment = await prisma.manualPayment.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
        amountPaise: true,
        event: {
          select: { id: true, title: true, venue: true, startsAt: true, endsAt: true, createdById: true },
        },
        ticketType: { select: { name: true } },
        user: { select: { email: true, fullName: true } },
      },
    });

    // Not found and not-yours look identical from outside.
    if (!payment || !canManageEvent(user, payment.event)) return notFound();

    if (body.action === "VERIFY") {
      const result = await verifyManualPayment({
        paymentId: payment.id,
        verifierUserId: user.id,
      });

      if (!result.ok) {
        return fail(409, result.reason, VERIFY_MESSAGES[result.reason]);
      }

      await audit({
        actorUserId: user.id,
        entityType: "ManualPayment",
        entityId: payment.id,
        action: "MANUAL_PAYMENT_VERIFIED",
        metadata: {
          eventId: payment.event.id,
          amountPaise: payment.amountPaise,
          ticketId: result.ticket.id,
          payerEmail: payment.user.email,
        },
      });

      await sendMail(
        ticketConfirmationEmail({
          to: payment.user.email,
          attendeeName: payment.user.fullName,
          eventTitle: payment.event.title,
          eventVenue: payment.event.venue,
          eventStartsAt: payment.event.startsAt,
          ticketTypeName: payment.ticketType.name,
          publicId: result.ticket.publicId,
        }),
      );

      return ok({ status: "VERIFIED", ticket: { publicId: result.ticket.publicId } });
    }

    const rejected = await rejectManualPayment({
      paymentId: payment.id,
      verifierUserId: user.id,
      reason: body.reason,
    });
    if (!rejected.ok) return fail(409, "NOT_PENDING", VERIFY_MESSAGES.NOT_PENDING);

    await audit({
      actorUserId: user.id,
      entityType: "ManualPayment",
      entityId: payment.id,
      action: "MANUAL_PAYMENT_REJECTED",
      metadata: {
        eventId: payment.event.id,
        amountPaise: payment.amountPaise,
        reason: body.reason,
        payerEmail: payment.user.email,
      },
    });

    await sendMail(
      paymentRejectedEmail({
        to: payment.user.email,
        attendeeName: payment.user.fullName,
        eventTitle: payment.event.title,
        ticketTypeName: payment.ticketType.name,
        reason: body.reason,
      }),
    );

    return ok({ status: "REJECTED" });
  } catch (err) {
    return serverError("review manual payment", err);
  }
}
