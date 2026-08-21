import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@ct/db";
import { ButtonLink, Card, EmptyState, PageHeader, TicketStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "My tickets" };
export const dynamic = "force-dynamic";

export default async function MyTicketsPage() {
  const user = await requireUser("/student/tickets");

  const tickets = await prisma.ticket.findMany({
    // Scoped to the session's own user — never a value from the URL.
    where: { ownerUserId: user.id },
    orderBy: [{ event: { startsAt: "asc" } }, { issuedAt: "desc" }],
    select: {
      id: true,
      publicId: true,
      status: true,
      issuedAt: true,
      event: { select: { title: true, venue: true, startsAt: true } },
      ticketType: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="My tickets"
        description="Open a ticket at the gate. Each ticket admits one person, once."
        action={
          <ButtonLink href="/" variant="secondary">
            Browse events
          </ButtonLink>
        }
      />

      {tickets.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          description="Register for an event and your ticket will appear here."
          action={<ButtonLink href="/">Browse events</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-medium text-slate-900">
                    <Link href={`/student/tickets/${ticket.publicId}`} className="hover:text-brand-700">
                      {ticket.event.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-slate-600">
                    {ticket.ticketType.name} · {formatDateTime(ticket.event.startsAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ticket.event.venue ?? "Venue to be announced"} · issued {formatDateTime(ticket.issuedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <TicketStatusBadge status={ticket.status} />
                  <ButtonLink href={`/student/tickets/${ticket.publicId}`} variant="secondary">
                    View ticket
                  </ButtonLink>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
