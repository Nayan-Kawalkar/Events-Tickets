import Link from "next/link";
import { prisma, EventStatus, type TicketStatus } from "@ct/db";
import { Poster } from "@/components/poster";
import { ButtonLink, EmptyState, TicketStatusBadge } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { UpdatesPanel } from "@/components/updates-panel";
import { getPastEvents, getPublishedEvents } from "@/lib/event-cache";
import { recentUpdates } from "@/lib/updates";
import { syncCompletedEvents } from "@/lib/event-status";
import { formatPrice } from "@/lib/format";
import { LIVE_TICKET_STATUS_LIST } from "@/lib/ticket-status";

export const dynamic = "force-dynamic";

const dayFormatter = new Intl.DateTimeFormat("en-IN", { day: "2-digit" });
const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short" });
const whenFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

type EventRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  venue: string | null;
  startsAt: Date;
  capacity: number | null;
  createdById: string;
  posterUploadId: string | null;
  _count: { tickets: number };
  ticketTypes: { pricePaise: number }[];
};

type BookedRow = {
  publicId: string;
  status: TicketStatus;
  ticketType: { name: string };
  event: {
    slug: string;
    title: string;
    venue: string | null;
    startsAt: Date;
    posterUploadId: string | null;
  };
};

export default async function HomePage() {
  // Finished events age into COMPLETED before anything is listed, so an event
  // never lingers in "upcoming" after it has ended.
  const [user] = await Promise.all([getCurrentUser(), syncCompletedEvents()]);

  // Per-user and deliberately uncached: a stale "your ticket is ready" is
  // worse than none at all.
  const updates = await recentUpdates(user);

  // Only published events are ever exposed publicly, and only ones still ahead.
  const events: EventRow[] = await getPublishedEvents();

  // Events this person is already going to. Past events drop off on their own
  // so the section stays a to-do list rather than a history.
  // Events this person hosts. They belong in "My events" too, with a host mark,
  // and unlike the public list they include drafts the host has not opened yet.
  const hosted = user
    ? await prisma.event.findMany({
        where: { createdById: user.id, endsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 12,
        select: {
          id: true,
          slug: true,
          title: true,
          venue: true,
          startsAt: true,
          status: true,
          posterUploadId: true,
          _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
        },
      })
    : [];

  const booked: BookedRow[] = user
    ? await prisma.ticket.findMany({
        where: {
          ownerUserId: user.id,
          status: { in: LIVE_TICKET_STATUS_LIST },
          event: { endsAt: { gte: new Date() } },
        },
        orderBy: { event: { startsAt: "asc" } },
        take: 12,
        select: {
          publicId: true,
          status: true,
          ticketType: { select: { name: true } },
          event: {
            select: {
              slug: true,
              title: true,
              venue: true,
              startsAt: true,
              posterUploadId: true,
            },
          },
        },
      })
    : [];

  // Anything already finished belongs in its own section, not the main list.
  const pastEvents = await getPastEvents();

  const [featured, ...rest] = events;

  return (
    <div className="section-gap">
      <header className="animate-rise">
        <p className="text-eyebrow">What&apos;s on campus</p>
        <h1 className="text-display-lg mt-2 text-slate-900">Upcoming events</h1>
        <p className="prose-measure mt-3 text-slate-600">
          Register in a minute and carry your ticket on your phone. No printing, no queue at a
          desk — just show the QR at the gate.
        </p>
      </header>

      {/* Above the listings on purpose: something needing your attention —
          a verified payment, a queue waiting on you — outranks browsing. */}
      <UpdatesPanel updates={updates} />

      {/* Order: the next event first, then what you are already going to,
          then everything else. */}
      {events.length > 0 ? <FeaturedEvent event={featured!} /> : null}

      {booked.length > 0 || hosted.length > 0 ? (
        <section aria-labelledby="my-events">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="my-events" className="text-display text-slate-900">
              My events
            </h2>
            <ButtonLink href="/tickets" variant="secondary">
              All tickets
            </ButtonLink>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hosted.map((event) => (
              <li key={`host-${event.id}`}>
                <article className="spotlight card-interactive group relative flex h-full gap-3 overflow-hidden rounded-xl border border-brand-500/30 bg-[#09201e]/90 p-3 shadow-lg shadow-black/40">
                  <Poster
                    uploadId={event.posterUploadId}
                    title={event.title}
                    ratio="poster"
                    sizes="80px"
                    className="w-20 shrink-0"
                  />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-medium text-slate-900">
                        <Link
                          href={`/events/${event.slug}`}
                          className="transition-colors after:absolute after:inset-0 hover:text-brand-300"
                        >
                          {event.title}
                        </Link>
                      </h3>
                      <span className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-inset ring-brand-500/40">
                        Host
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-600">
                      {whenFormatter.format(event.startsAt)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {event.venue ?? "Venue to be announced"}
                    </p>

                    <p className="mt-auto pt-2 text-xs font-medium text-brand-400">
                      {event._count.tickets} registered · {event.status.toLowerCase()} · Manage →
                    </p>
                  </div>
                </article>
              </li>
            ))}

            {booked.map((ticket) => (
              <li key={ticket.publicId}>
                <article className="spotlight card-interactive group relative flex h-full gap-3 overflow-hidden rounded-xl border border-brand-500/25 bg-[#09201e]/90 p-3 shadow-lg shadow-black/40">
                  <Poster
                    uploadId={ticket.event.posterUploadId}
                    title={ticket.event.title}
                    ratio="poster"
                    sizes="80px"
                    className="w-20 shrink-0"
                  />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-medium text-slate-900">
                        <Link
                          href={`/tickets/${ticket.publicId}`}
                          className="transition-colors after:absolute after:inset-0 hover:text-brand-300"
                        >
                          {ticket.event.title}
                        </Link>
                      </h3>
                      <TicketStatusBadge status={ticket.status} />
                    </div>

                    <p className="mt-1 text-xs text-slate-600">
                      {whenFormatter.format(ticket.event.startsAt)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {ticket.event.venue ?? "Venue to be announced"}
                    </p>

                    <p className="mt-auto pt-2 text-xs font-medium text-brand-400">
                      {ticket.ticketType.name} · View ticket →
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          title="No events published yet"
          description="Check back soon — organizers publish events here once registration opens."
        />
      ) : rest.length > 0 ? (
        <section aria-labelledby="more-events">
          <h2 id="more-events" className="text-display mb-5 text-slate-900">
            More events
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pastEvents.length > 0 ? (
        <section aria-labelledby="past-events">
          <h2 id="past-events" className="text-display mb-1 text-slate-900">
            Past events
          </h2>
          <p className="mb-5 text-sm text-slate-600">
            Finished. Kept here for the record — registration is closed.
          </p>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pastEvents.map((event) => (
              <li key={event.id}>
                <article className="spotlight group relative flex h-full gap-3 overflow-hidden rounded-xl border border-white/8 bg-[#09201e]/60 p-3">
                  <Poster
                    uploadId={event.posterUploadId}
                    title={event.title}
                    ratio="poster"
                    sizes="80px"
                    className="w-20 shrink-0 opacity-60 grayscale"
                  />

                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="truncate font-medium text-slate-700">
                      <Link
                        href={`/events/${event.slug}`}
                        className="transition-colors after:absolute after:inset-0 hover:text-brand-300"
                      >
                        {event.title}
                      </Link>
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Ended {whenFormatter.format(event.endsAt)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {event.venue ?? "Venue not recorded"}
                    </p>
                    <p className="mt-auto pt-2 text-xs text-slate-500">
                      {event._count.tickets} attended
                    </p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function priceLabel(ticketTypes: { pricePaise: number }[]) {
  if (ticketTypes.length === 0) return "—";
  const from = Math.min(...ticketTypes.map((t) => t.pricePaise));
  return from === 0 ? "Free" : `From ${formatPrice(from)}`;
}

function seatsLabel(event: EventRow) {
  if (event.capacity === null) return null;
  const left = Math.max(0, event.capacity - event._count.tickets);
  if (left === 0) return "Sold out";
  if (left <= 20) return `Only ${left} left`;
  return `${left} seats left`;
}

/** Date chip: big day number over a short month, like a torn calendar page. */
function DateChip({ date, className = "" }: { date: Date; className?: string }) {
  return (
    <div
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-white/10 bg-black/60 backdrop-blur-sm ${className}`}
    >
      <span className="font-display text-xl leading-none text-slate-900">
        {dayFormatter.format(date)}
      </span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-400">
        {monthFormatter.format(date)}
      </span>
    </div>
  );
}

function FeaturedEvent({ event }: { event: EventRow }) {
  const seats = seatsLabel(event);

  return (
    <section aria-labelledby="featured" className="animate-rise">
      <article className="spotlight group overflow-hidden rounded-2xl border border-white/8 bg-[#09201e]/90 shadow-xl shadow-black/40">
        <div className="grid md:grid-cols-2">
          <Poster
            uploadId={event.posterUploadId}
            title={event.title}
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            // From md up the poster stretches to the text column's height, so the
            // fixed aspect ratio is dropped; `h-full` alone would resolve to 0
            // against an auto-height grid row and the image would never load.
            className="rounded-none md:aspect-auto md:min-h-[22rem]"
          />

          <div className="flex flex-col justify-center gap-4 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-brand-500/12 px-2.5 py-0.5 text-xs font-medium tracking-wide text-brand-300 ring-1 ring-inset ring-brand-500/40">
                Next up
              </span>
              {seats ? <span className="text-xs text-slate-500">{seats}</span> : null}
            </div>

            <h2 id="featured" className="text-display text-slate-900">
              <Link href={`/events/${event.slug}`} className="transition-colors hover:text-brand-300">
                {event.title}
              </Link>
            </h2>

            {event.description ? (
              <p className="prose-measure line-clamp-3 text-sm text-slate-600">{event.description}</p>
            ) : null}

            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-eyebrow">When</dt>
                <dd className="mt-1 text-slate-800">{whenFormatter.format(event.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-eyebrow">Where</dt>
                <dd className="mt-1 text-slate-800">{event.venue ?? "To be announced"}</dd>
              </div>
              <div>
                <dt className="text-eyebrow">Entry</dt>
                <dd className="mt-1 text-slate-800">{priceLabel(event.ticketTypes)}</dd>
              </div>
            </dl>

            <div className="pt-1">
              <ButtonLink href={`/events/${event.slug}`}>View event</ButtonLink>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

function EventCard({ event }: { event: EventRow }) {
  const seats = seatsLabel(event);

  return (
    <article className="spotlight card-interactive group relative flex h-full flex-col overflow-hidden rounded-xl border border-white/8 bg-[#09201e]/90 shadow-lg shadow-black/40">
      <div className="relative">
        <Poster uploadId={event.posterUploadId} title={event.title} className="rounded-none" />
        <DateChip date={event.startsAt} className="absolute bottom-3 left-3" />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <h3 className="text-title text-slate-900">
          {/* Stretched link: the whole card is clickable, focus still lands on the title. */}
          <Link
            href={`/events/${event.slug}`}
            className="transition-colors after:absolute after:inset-0 hover:text-brand-300"
          >
            {event.title}
          </Link>
        </h3>

        <p className="text-sm text-slate-600">
          {whenFormatter.format(event.startsAt)}
          {event.venue ? ` · ${event.venue}` : ""}
        </p>

        <div className="mt-auto flex items-center justify-between border-t border-white/6 pt-3">
          <span className="text-sm font-medium text-slate-800">{priceLabel(event.ticketTypes)}</span>
          {seats ? <span className="text-xs text-slate-500">{seats}</span> : null}
        </div>
      </div>
    </article>
  );
}
