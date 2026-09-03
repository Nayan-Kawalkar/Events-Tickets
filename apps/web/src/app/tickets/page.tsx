import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@ct/db";
import { Poster } from "@/components/poster";
import { SectionTabs } from "@/components/section-tabs";
import { ButtonLink, EmptyState, PageHeader, TicketStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "My tickets" };
export const dynamic = "force-dynamic";

type TicketRow = {
  id: string;
  publicId: string;
  status: Parameters<typeof TicketStatusBadge>[0]["status"];
  event: { title: string; venue: string | null; startsAt: Date; endsAt: Date; posterUploadId: string | null };
  ticketType: { name: string };
};

type Props = { searchParams: Promise<{ show?: string }> };

export default async function MyTicketsPage({ searchParams }: Props) {
  const [user, sp] = await Promise.all([requireUser("/tickets"), searchParams]);

  const tickets = await prisma.ticket.findMany({
    relationLoadStrategy: "join",
    // Scoped to the session's own user — never a value from the URL.
    where: { ownerUserId: user.id },
    orderBy: [{ event: { startsAt: "asc" } }, { issuedAt: "desc" }],
    select: {
      id: true,
      publicId: true,
      status: true,
      issuedAt: true,
      event: {
        select: { title: true, venue: true, startsAt: true, endsAt: true, posterUploadId: true },
      },
      ticketType: { select: { name: true } },
    },
  });

  // Split on the event having finished rather than on ticket status: a ticket
  // that was never scanned still belongs in the past once the event is over.
  const now = Date.now();
  const current: TicketRow[] = [];
  const past: TicketRow[] = [];
  for (const ticket of tickets) {
    (ticket.event.endsAt.getTime() >= now ? current : past).push(ticket);
  }
  // Most recent first: looking back, the last event matters more than the first.
  past.reverse();

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
        // Both lists come from the one query above, so switching between them
        // costs no request — it is the same data, shown two ways.
        <SectionTabs
          label="Which tickets to show"
          param="show"
          initial={sp.show === "past" ? "past" : "current"}
          sections={[
            {
              value: "current",
              label: "Current",
              count: current.length,
              content:
                current.length === 0 ? (
                  <EmptyState
                    title="Nothing coming up"
                    description="Your finished events are under Past."
                    action={<ButtonLink href="/">Browse events</ButtonLink>}
                  />
                ) : (
                  <TicketList tickets={current} />
                ),
            },
            {
              value: "past",
              label: "Past",
              count: past.length,
              content:
                past.length === 0 ? (
                  <EmptyState
                    title="No past tickets"
                    description="Tickets move here once the event has finished."
                  />
                ) : (
                  <TicketList tickets={past} past />
                ),
            },
          ]}
        />
      )}
    </>
  );
}

/** One list of tickets. `past` dims the card so the two read differently. */
function TicketList({ tickets, past = false }: { tickets: TicketRow[]; past?: boolean }) {
  return (
    <ul className="space-y-3">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <article
            className={
              "spotlight card-interactive group relative flex gap-4 overflow-hidden rounded-xl border border-white/8 bg-[#09201e]/90 p-4 shadow-lg shadow-black/40" +
              (past ? " opacity-75" : "")
            }
          >
            <Poster
              uploadId={ticket.event.posterUploadId}
              title={ticket.event.title}
              ratio="poster"
              sizes="96px"
              className="hidden w-24 shrink-0 sm:block"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-title truncate text-slate-900">
                  <Link
                    href={`/tickets/${ticket.publicId}`}
                    className="transition-colors after:absolute after:inset-0 hover:text-brand-300"
                  >
                    {ticket.event.title}
                  </Link>
                </h2>
                <TicketStatusBadge status={ticket.status} />
              </div>

              <p className="text-sm text-slate-600">
                {ticket.ticketType.name} · {formatDateTime(ticket.event.startsAt)}
              </p>
              <p className="text-xs text-slate-500">
                {ticket.event.venue ?? "Venue to be announced"}
              </p>

              <div className="mt-auto pt-2">
                <span className="text-xs text-brand-400">
                  {past ? "View record →" : "View ticket →"}
                </span>
              </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
