import Link from "next/link";
import type { Metadata } from "next";
import { prisma, ManualPaymentStatus } from "@ct/db";
import { Alert, ButtonLink, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "My payments" };
export const dynamic = "force-dynamic";

const statusStyles: Record<ManualPaymentStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-300",
  VERIFIED: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  REJECTED: "bg-red-50 text-red-800 ring-red-300",
  EXPIRED: "bg-slate-100 text-slate-700 ring-slate-300",
};

const statusLabels: Record<ManualPaymentStatus, string> = {
  PENDING: "awaiting verification",
  VERIFIED: "verified",
  REJECTED: "not verified",
  EXPIRED: "expired",
};

type Props = { searchParams: Promise<{ submitted?: string }> };

export default async function MyPaymentsPage({ searchParams }: Props) {
  const user = await requireUser("/student/payments");
  const submitted = (await searchParams).submitted === "1";

  const payments = await prisma.manualPayment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amountPaise: true,
      status: true,
      createdAt: true,
      upiTransactionId: true,
      rejectionReason: true,
      event: { select: { title: true } },
      ticketType: { select: { name: true } },
      issuedTicket: { select: { publicId: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="My payments"
        description="UPI payments you have submitted for verification."
      />

      {submitted ? (
        <div className="mb-4">
          <Alert tone="success">
            Payment details submitted. The organizer will verify them and email you. No ticket has
            been issued yet.
          </Alert>
        </div>
      ) : null}

      {payments.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Paid tickets you pay for by UPI will appear here."
          action={<ButtonLink href="/">Browse events</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {payments.map((payment) => (
            <li key={payment.id}>
              <Card className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{payment.event.title}</p>
                    <p className="text-sm text-slate-600">
                      {payment.ticketType.name} · {formatPrice(payment.amountPaise)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Submitted {formatDateTime(payment.createdAt)}
                      {payment.upiTransactionId ? ` · ref ${payment.upiTransactionId}` : ""}
                    </p>
                  </div>
                  <span
                    className={cx(
                      "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      statusStyles[payment.status],
                    )}
                  >
                    {statusLabels[payment.status]}
                  </span>
                </div>

                {payment.status === ManualPaymentStatus.REJECTED && payment.rejectionReason ? (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                    Reason: {payment.rejectionReason}
                  </p>
                ) : null}

                {payment.issuedTicket ? (
                  <Link
                    href={`/student/tickets/${payment.issuedTicket.publicId}`}
                    className="inline-block text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
                  >
                    View your ticket →
                  </Link>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
