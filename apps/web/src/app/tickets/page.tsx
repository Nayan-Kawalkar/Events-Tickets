import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@ct/db";
import { Poster } from "@/components/poster";
import { ButtonLink, EmptyState, PageHeader, TicketStatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "My tickets" };
export const dynamic = "force-dynamic";

export default async function MyTicketsPage() {
  const user = await requireUser("/tickets");

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
      event: { select: { title: true, venue: true, startsAt: true, posterUploadId: true } },
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
              <article className="spotlight card-interactive group relative flex gap-4 overflow-hidden rounded-xl border border-white/8 bg-[#09201e]/90 p-4 shadow-lg shadow-black/40">
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
                    <span className="text-xs text-brand-400">View ticket →</span>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
