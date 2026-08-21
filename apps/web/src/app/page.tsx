import Link from "next/link";
import { prisma, EventStatus } from "@ct/db";
import { Poster } from "@/components/poster";
import { ButtonLink, EmptyState } from "@/components/ui";
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
  posterUploadId: string | null;
  _count: { tickets: number };
  ticketTypes: { pricePaise: number }[];
};

export default async function HomePage() {
  // Only published events are ever exposed publicly.
  const events: EventRow[] = await prisma.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      venue: true,
      startsAt: true,
      capacity: true,
      posterUploadId: true,
      _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
      ticketTypes: { select: { pricePaise: true } },
    },
  });

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

      {events.length === 0 ? (
        <EmptyState
          title="No events published yet"
          description="Check back soon — organizers publish events here once registration opens."
        />
      ) : (
        <>
          <FeaturedEvent event={featured!} />

          {rest.length > 0 ? (
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
        </>
      )}
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
            className="rounded-none md:h-full"
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
