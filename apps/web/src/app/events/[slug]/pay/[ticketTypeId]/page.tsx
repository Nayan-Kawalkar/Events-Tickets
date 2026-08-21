import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, EventStatus, ManualPaymentStatus, PaymentMode } from "@ct/db";
import { CopyField } from "@/components/copy-field";
import { ManualPaymentForm } from "@/components/manual-payment-form";
import { UpiQr } from "@/components/upi-qr";
import { Alert, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { buildUpiUri } from "@/lib/upi";
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
        requiresStudentId: true,
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
  const amountRupees = (ticketType.pricePaise / 100).toFixed(2);

  const upiUri = ticketType.organizerUpiId
    ? buildUpiUri({
        payeeVpa: ticketType.organizerUpiId,
        payeeName: ticketType.organizerUpiName ?? ticketType.event.title,
        amountPaise: ticketType.pricePaise,
        note: `${ticketType.event.title} ${ticketType.name}`,
      })
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
          <h2 className="text-eyebrow">Step 1 — Pay by UPI</h2>

          {upiUri ? (
            <>
              {/* Scanning is the reliable path: the payment is then initiated by
                  the UPI app itself, which personal VPAs accept. */}
              <UpiQr
                uri={upiUri}
                amountLabel={amount}
                payeeName={ticketType.organizerUpiName}
                vpa={ticketType.organizerUpiId!}
              />

              <div className="space-y-2">
                <CopyField label="Amount (₹)" value={amountRupees} />
                <CopyField label="UPI ID" value={ticketType.organizerUpiId!} />
                {ticketType.organizerUpiName ? (
                  <p className="px-1 text-xs text-slate-500">
                    Account name: {ticketType.organizerUpiName}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-600">
                <p className="mb-1 font-medium text-slate-800">How to pay</p>
                <p>
                  Open your UPI app and scan this QR with it, or paste the UPI ID above as a new
                  payee. Launching a UPI app straight from a browser link often fails for personal
                  UPI IDs — apps report it as a permission or limit error even when your limit is
                  fine.
                </p>
                <p className="mt-2">
                  Some banks also cap a <strong>new payee at ₹5,000 for the first 24 hours</strong>.
                  If the payment is refused above that, add the payee first, or use another app.
                </p>
              </div>

              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer py-1 hover:text-slate-700">
                  Try opening a UPI app directly
                </summary>
                <a
                  href={upiUri}
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-white/12 px-4 text-sm text-slate-800 transition-colors hover:border-brand-500/60 hover:text-brand-300"
                >
                  Open UPI app
                </a>
                <p className="mt-1.5">
                  Often blocked for personal UPI IDs. If it errors, scan the QR instead.
                </p>
              </details>
            </>
          ) : (
            <p className="rounded-lg bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200 ring-1 ring-inset ring-amber-400/30">
              The organizer has not set up a UPI ID for this ticket yet. Please contact them.
            </p>
          )}

          {ticketType.organizerUpiQrUploadId ? (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer py-1 hover:text-slate-700">
                Organizer&apos;s own QR code
              </summary>
              <img
                src={`/api/uploads/${ticketType.organizerUpiQrUploadId}`}
                alt="UPI QR code supplied by the organizer"
                className="mt-2 w-full max-w-[15rem] rounded-xl ring-1 ring-white/10"
              />
              <p className="mt-1.5">This one may not have the amount pre-filled.</p>
            </details>
          ) : null}

          <p className="text-xs text-slate-500">
            Pay exactly {amount}. A different amount cannot be matched to your registration and
            will be rejected.
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
          requiresStudentId={ticketType.requiresStudentId}
          defaults={{
            attendeeName: user.fullName,
            attendeeEmail: user.email,
            attendeePhone: "",
            attendeeRollNumber: user.rollNumber ?? "",
            attendeeDepartment: user.department ?? "",
          }}
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
