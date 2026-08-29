import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, ManualPaymentStatus, Role } from "@ct/db";
import { FilterChips, SearchBox } from "@/components/list-controls";
import { PaymentReviewCard, type PendingPayment } from "@/components/payment-review";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { formatDateTime, formatPrice } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Payment verification" };
export const dynamic = "force-dynamic";

/** History only: the pending queue is by definition all still pending. */
const HISTORY_FILTERS = [
  { label: "All", value: "" },
  { label: "Verified", value: ManualPaymentStatus.VERIFIED },
  { label: "Rejected", value: ManualPaymentStatus.REJECTED },
] as const;

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
};

export default async function PaymentsPage({ params, searchParams }: Props) {
  const [user, sp] = await Promise.all([
    requireRole([Role.ORGANIZER, Role.ADMIN]),
    searchParams,
  ]);

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) notFound();

  // Only someone who can manage the event sees its payments or screenshots.
  const event = await findManageableEvent(user, idResult.data);
  if (!event) notFound();

  const q = sp.q?.trim() ?? "";
  const historyStatus = HISTORY_FILTERS.some((f) => f.value && f.value === sp.status)
    ? (sp.status as ManualPaymentStatus)
    : "";

  // Payer name, email, or the UTR they typed — the three things an organizer
  // has to hand when someone asks "where is my ticket?".
  const matching = q
    ? {
        OR: [
          { user: { fullName: { contains: q, mode: "insensitive" as const } } },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
          { upiTransactionId: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [pending, handled, pendingTotal] = await Promise.all([
    prisma.manualPayment.findMany({
      where: { eventId: event.id, status: ManualPaymentStatus.PENDING, ...matching },
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
      where: {
        eventId: event.id,
        status: historyStatus ? historyStatus : { not: ManualPaymentStatus.PENDING },
        ...matching,
      },
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
    prisma.manualPayment.count({
      where: { eventId: event.id, status: ManualPaymentStatus.PENDING },
    }),
  ]);

  const queue: PendingPayment[] = pending.map((payment) => ({
    id: payment.id,
    amountLabel: payment.amountPaise === 0 ? "Free" : formatPrice(payment.amountPaise),
    // Nothing was paid, so this is a person to vet rather than a transfer
    // to check against a bank statement.
    freeApproval: payment.amountPaise === 0,
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
        description={`${pendingTotal} awaiting verification`}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/scanner?event=${event.id}`}>Scan tickets</ButtonLink>
            <ButtonLink href={`/organizer/events/${event.id}/attendees`} variant="secondary">
              Guest list
            </ButtonLink>
            <ButtonLink href={`/organizer/events/${event.id}`} variant="secondary">
              Event
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

      <div className="mb-6">
        <SearchBox
          action={`/organizer/events/${event.id}/payments`}
          value={q}
          placeholder="Search payer name, email or UTR"
          hidden={{ status: historyStatus }}
        />
      </div>

      <section aria-labelledby="queue" className="mb-10">
        <h2 id="queue" className="mb-3 font-display text-xl font-normal text-slate-900">
          Awaiting verification
        </h2>

        {queue.length === 0 ? (
          <EmptyState
            title={q ? "No pending payments match that search" : "Nothing to verify"}
            description={q ? undefined : "New UPI payments will appear here."}
          />
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

        <div className="mb-3">
          <FilterChips
            label="Filter handled payments"
            basePath={`/organizer/events/${event.id}/payments`}
            param="status"
            current={historyStatus}
            options={HISTORY_FILTERS}
            params={{ q }}
          />
        </div>

        {handled.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">
              {q || historyStatus
                ? "No handled payments match this view."
                : "No payments have been handled yet."}
            </p>
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
