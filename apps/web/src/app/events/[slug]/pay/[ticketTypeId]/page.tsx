import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, EventStatus, ManualPaymentStatus, PaymentMode } from "@ct/db";
import { ManualPaymentForm } from "@/components/manual-payment-form";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Pay by UPI" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; ticketTypeId: string }> };

export default async function ManualPayPage({ params }: Props) {
  const { slug, ticketTypeId } = await params;

  const idResult = uuidSchema.safeParse(ticketTypeId);
  if (!idResult.success) notFound();

  // The session lookup and the ticket-type read do not depend on each other.
  const [user, ticketType] = await Promise.all([
    requireUser(`/events/${slug}/pay/${ticketTypeId}`),
    prisma.ticketType.findUnique({
      where: { id: idResult.data },
      select: {
        id: true,
        name: true,
        pricePaise: true,
        paymentMode: true,
        organizerUpiId: true,
        organizerUpiName: true,
        organizerUpiQrUploadId: true,
        event: { select: { id: true, slug: true, title: true, status: true } },
      },
    }),
  ]);

  // Only reachable for a manual-UPI type on this event's page.
  if (
    !ticketType ||
    ticketType.event.slug !== slug ||
    ticketType.paymentMode !== PaymentMode.MANUAL_UPI ||
    ticketType.event.status !== EventStatus.PUBLISHED
  ) {
    notFound();
  }

  const existing = await prisma.manualPayment.findFirst({
    where: { ticketTypeId: ticketType.id, userId: user.id, status: ManualPaymentStatus.PENDING },
    select: { id: true, createdAt: true },
  });

  const amount = formatPrice(ticketType.pricePaise);
  const upiLink = ticketType.organizerUpiId
    ? `upi://pay?pa=${encodeURIComponent(ticketType.organizerUpiId)}&pn=${encodeURIComponent(
        ticketType.organizerUpiName ?? ticketType.event.title,
      )}&am=${(ticketType.pricePaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(
        `${ticketType.event.title} ${ticketType.name}`,
      )}`
    : null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={`Pay ${amount}`}
        description={`${ticketType.event.title} · ${ticketType.name}`}
      />

      {existing ? (
        <div className="mb-4">
          <Alert tone="info">
            You already have a payment awaiting verification for this ticket. You do not need to
            pay again —{" "}
            <Link href="/payments" className="font-medium underline">
              check its status
            </Link>
            .
          </Alert>
        </div>
      ) : null}

      <div className="space-y-5">
        <Card className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Step 1 — Pay by UPI
          </h2>

          {ticketType.organizerUpiQrUploadId ? (
            <img
              src={`/api/uploads/${ticketType.organizerUpiQrUploadId}`}
              alt={`UPI QR code for ${ticketType.organizerUpiName ?? "the organizer"}`}
              className="mx-auto w-full max-w-xs rounded-xl ring-1 ring-white/10"
            />
          ) : null}

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-slate-700">Amount</dt>
              <dd className="font-semibold text-slate-900">{amount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-slate-700">UPI ID</dt>
              <dd className="break-all font-mono text-slate-900">
                {ticketType.organizerUpiId ?? "Not set — contact the organizer"}
              </dd>
            </div>
            {ticketType.organizerUpiName ? (
              <div className="flex justify-between gap-4">
                <dt className="font-medium text-slate-700">Account name</dt>
                <dd className="text-slate-900">{ticketType.organizerUpiName}</dd>
              </div>
            ) : null}
          </dl>

          {upiLink ? (
            <a
              href={upiLink}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-[#04231c] transition-all duration-200 hover:bg-brand-400 hover:shadow-[0_8px_24px_-6px_rgba(43,220,163,0.55)]"
            >
              Open UPI app
            </a>
          ) : null}

          <p className="text-xs text-slate-500">
            Pay the exact amount. Transfers of a different amount cannot be matched to your
            registration and will be rejected.
          </p>
        </Card>

        <Card className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Step 2 — Send us the proof
          </h2>
          <p className="text-sm text-slate-600">
            After paying, enter the UPI reference number and upload the screenshot from your
            payment app.
          </p>
        </Card>

        <ManualPaymentForm
          eventId={ticketType.event.id}
          ticketTypeId={ticketType.id}
          amountLabel={amount}
        />

        <p className="text-sm text-slate-600">
          <Link
            href={`/events/${slug}`}
            className="font-medium text-brand-400 underline-offset-2 hover:underline"
          >
            ← Back to the event
          </Link>
        </p>
      </div>
    </div>
  );
}
