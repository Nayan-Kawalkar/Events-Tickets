import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, Role, TicketStatus } from "@ct/db";
import { TicketQr } from "@/components/ticket-qr";
import { Alert, Card, PageHeader, TicketStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { generateQrPayload } from "@/lib/qr";

export const metadata: Metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ new?: string }>;
};

export default async function TicketDetailPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const user = await requireUser(`/tickets/${publicId}`);
  const isNew = (await searchParams).new === "1";

  const ticket = await prisma.ticket.findUnique({
    where: { publicId },
    select: {
      publicId: true,
      status: true,
      issuedAt: true,
      checkedInAt: true,
      ownerUserId: true,
      owner: { select: { fullName: true, rollNumber: true } },
      event: { select: { id: true, title: true, venue: true, startsAt: true, endsAt: true } },
      ticketType: { select: { name: true, pricePaise: true, requiresStudentId: true } },
    },
  });

  // Only the holder or an admin may view a ticket. A guessed public id must look
  // exactly like one that does not exist.
  if (!ticket || (ticket.ownerUserId !== user.id && user.role !== Role.ADMIN)) notFound();

  const isUsable = ticket.status === TicketStatus.ISSUED;

  // Signed server-side on every render; nothing signable is exposed to the client.
  const qrPayload = generateQrPayload({ publicId: ticket.publicId, event: ticket.event });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={ticket.event.title}
        description={ticket.ticketType.name}
        action={<TicketStatusBadge status={ticket.status} />}
      />

      {isNew ? (
        <div className="mb-4">
          <Alert tone="success">
            You are registered. A confirmation email is on its way.
          </Alert>
        </div>
      ) : null}

      <Card className="space-y-5">
        <div className="space-y-2">
          <TicketQr payload={qrPayload} dimmed={!isUsable} />
          <p className="text-center text-xs text-slate-500">
            Ticket code <span className="font-mono text-slate-700">{ticket.publicId}</span>
          </p>
          <p className="text-center text-xs text-slate-500">
            Show this QR at the gate. Screen brightness up helps the scanner.
          </p>
        </div>

        {!isUsable ? (
          <Alert tone={ticket.status === TicketStatus.CHECKED_IN ? "info" : "error"}>
            {ticket.status === TicketStatus.CHECKED_IN
              ? `This ticket was already used${ticket.checkedInAt ? ` at ${formatDateTime(ticket.checkedInAt)}` : ""}. It cannot be used again.`
              : `This ticket is ${ticket.status.toLowerCase()} and will not be admitted.`}
          </Alert>
        ) : null}

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-700">Attendee</dt>
            <dd className="text-slate-600">{ticket.owner.fullName}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Roll number</dt>
            <dd className="text-slate-600">{ticket.owner.rollNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">When</dt>
            <dd className="text-slate-600">{formatDateTime(ticket.event.startsAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Where</dt>
            <dd className="text-slate-600">{ticket.event.venue ?? "To be announced"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Ticket type</dt>
            <dd className="text-slate-600">
              {ticket.ticketType.name} · {formatPrice(ticket.ticketType.pricePaise)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Issued</dt>
            <dd className="text-slate-600">{formatDateTime(ticket.issuedAt)}</dd>
          </div>
        </dl>

        {ticket.ticketType.requiresStudentId ? (
          <p className="rounded-lg bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-inset ring-amber-400/30">
            Carry your college ID. Gate staff may check it against this ticket.
          </p>
        ) : null}
      </Card>

      <p className="mt-4 text-sm text-slate-600">
        <Link href="/tickets" className="font-medium text-brand-400 underline-offset-2 hover:underline">
          ← All my tickets
        </Link>
      </p>
    </div>
  );
}
