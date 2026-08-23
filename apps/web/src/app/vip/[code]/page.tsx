import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, VipPassStatus } from "@ct/db";
import { TicketQr } from "@/components/ticket-qr";
import { Alert, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { buildVipPayload } from "@/lib/vip-pass";

export const metadata: Metadata = {
  title: "Guest pass",
  // A pass link is a private entitlement; keep it out of search results.
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/**
 * The guest's view of a VIP pass.
 *
 * Deliberately public: the whole point is that a chief guest or sponsor can
 * open the link and walk in without registering or creating an account. The
 * unguessable code in the URL is the entitlement.
 */
export default async function VipPassPage({ params }: Props) {
  const { code } = await params;

  const pass = await prisma.vipPass.findUnique({
    where: { code },
    select: {
      guestName: true,
      note: true,
      status: true,
      usedAt: true,
      code: true,
      event: {
        select: { title: true, venue: true, addressLine: true, startsAt: true, endsAt: true },
      },
    },
  });

  if (!pass) notFound();

  const usable = pass.status === VipPassStatus.ACTIVE && pass.event.endsAt.getTime() > Date.now();
  const payload = buildVipPayload({ code: pass.code }, pass.event.endsAt);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={pass.event.title} description="Guest pass" />

      <Card className="space-y-5">
        <div className="space-y-2">
          <TicketQr payload={payload} dimmed={!usable} />
          <p className="text-center text-sm font-medium text-slate-900">{pass.guestName}</p>
          <p className="text-center text-xs text-slate-500">
            Show this at the gate. It admits one person, once.
          </p>
        </div>

        {!usable ? (
          <Alert tone={pass.status === VipPassStatus.USED ? "info" : "error"}>
            {pass.status === VipPassStatus.USED
              ? `This pass was already used${pass.usedAt ? ` at ${formatDateTime(pass.usedAt)}` : ""}.`
              : pass.status === VipPassStatus.REVOKED
                ? "This pass was cancelled by the organizer."
                : "This event has finished."}
          </Alert>
        ) : null}

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-700">When</dt>
            <dd className="text-slate-600">{formatDateTime(pass.event.startsAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Where</dt>
            <dd className="text-slate-600">
              {pass.event.venue ?? "To be announced"}
              {pass.event.addressLine ? (
                <span className="mt-0.5 block text-xs text-slate-500">{pass.event.addressLine}</span>
              ) : null}
            </dd>
          </div>
          {pass.note ? (
            <div className="sm:col-span-2">
              <dt className="font-medium text-slate-700">Note from the organizer</dt>
              <dd className="text-slate-600">{pass.note}</dd>
            </div>
          ) : null}
        </dl>

        <p className="rounded-lg bg-amber-400/10 px-4 py-3 text-xs text-amber-200 ring-1 ring-inset ring-amber-400/30">
          Keep this link private. Anyone who opens it can use the pass.
        </p>
      </Card>
    </div>
  );
}
