import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, ManualPaymentStatus, Role } from "@ct/db";
import { PaymentReviewCard, type PendingPayment } from "@/components/payment-review";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { formatDateTime, formatPrice } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Payment verification" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ eventId: string }> };

export default async function PaymentsPage({ params }: Props) {
  const user = await requireRole([Role.ORGANIZER, Role.ADMIN]);

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) notFound();

  // Only someone who can manage the event sees its payments or screenshots.
  const event = await findManageableEvent(user, idResult.data);
  if (!event) notFound();

  const [pending, handled] = await Promise.all([
    prisma.manualPayment.findMany({
      where: { eventId: event.id, status: ManualPaymentStatus.PENDING },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        amountPaise: true,
        createdAt: true,
        upiTransactionId: true,
        screenshotUploadId: true,
        attendee: true,
        ticketType: { select: { name: true } },
        user: { select: { fullName: true, email: true, rollNumber: true } },
      },
    }),
    prisma.manualPayment.findMany({
      where: { eventId: event.id, status: { not: ManualPaymentStatus.PENDING } },
      orderBy: { verifiedAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountPaise: true,
        status: true,
        verifiedAt: true,
        rejectionReason: true,
        ticketType: { select: { name: true } },
        user: { select: { fullName: true, email: true } },
        verifiedBy: { select: { fullName: true } },
      },
    }),
  ]);

  const queue: PendingPayment[] = pending.map((payment) => ({
    id: payment.id,
    amountLabel: formatPrice(payment.amountPaise),
    ticketTypeName: payment.ticketType.name,
    submittedAt: formatDateTime(payment.createdAt),
    upiTransactionId: payment.upiTransactionId,
    screenshotUploadId: payment.screenshotUploadId,
    payer: {
      // Show the attendee named at payment, not just the account holder.
      name:
        (payment.attendee as { attendeeName?: string } | null)?.attendeeName ??
        payment.user.fullName,
      email:
        (payment.attendee as { attendeeEmail?: string } | null)?.attendeeEmail ??
        payment.user.email,
      rollNumber:
        (payment.attendee as { attendeeRollNumber?: string } | null)?.attendeeRollNumber ??
        payment.user.rollNumber,
    },
  }));

  return (
    <>
      <PageHeader
        title={`Payments · ${event.title}`}
        description={`${queue.length} awaiting verification`}
        action={
          <div className="flex gap-2">
            <ButtonLink href={`/organizer/events/${event.id}/attendees`} variant="secondary">
              Attendees
            </ButtonLink>
            <ButtonLink href={`/organizer/events/${event.id}/edit`} variant="secondary">
              Edit event
            </ButtonLink>
          </div>
        }
      />

      <div className="mb-6">
        <Alert tone="info">
          Verifying issues a real ticket. Check each payment against your UPI or bank statement
          first — a screenshot proves nothing on its own.
        </Alert>
      </div>

      <section aria-labelledby="queue" className="mb-10">
        <h2 id="queue" className="mb-3 font-display text-xl font-normal text-slate-900">
          Awaiting verification
        </h2>

        {queue.length === 0 ? (
          <EmptyState title="Nothing to verify" description="New UPI payments will appear here." />
        ) : (
          <ul className="space-y-4">
            {queue.map((payment) => (
              <li key={payment.id}>
                <PaymentReviewCard payment={payment} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="handled">
        <h2 id="handled" className="mb-3 font-display text-xl font-normal text-slate-900">
          Already handled
        </h2>

        {handled.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">No payments have been handled yet.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {handled.map((payment) => (
              <li key={payment.id}>
                <Card className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{payment.user.fullName}</p>
                    <p className="text-xs text-slate-600">
                      {payment.ticketType.name} · {formatPrice(payment.amountPaise)} ·{" "}
                      {formatDateTime(payment.verifiedAt)}
                      {payment.verifiedBy ? ` by ${payment.verifiedBy.fullName}` : ""}
                    </p>
                    {payment.rejectionReason ? (
                      <p className="text-xs text-red-300">Reason: {payment.rejectionReason}</p>
                    ) : null}
                  </div>
                  <span
                    className={cx(
                      "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      payment.status === ManualPaymentStatus.VERIFIED
                        ? "bg-brand-500/12 text-brand-300 ring-brand-500/40"
                        : "bg-red-500/10 text-red-300 ring-red-400/30",
                    )}
                  >
                    {payment.status.toLowerCase()}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
