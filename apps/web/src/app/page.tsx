import Link from "next/link";
import { prisma, EventStatus } from "@ct/db";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Only published events are ever exposed publicly.
  const events = await prisma.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      venue: true,
      startsAt: true,
      ticketTypes: { select: { pricePaise: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Upcoming events"
        description="Register in a minute and carry your ticket on your phone."
      />

      {events.length === 0 ? (
        <EmptyState
          title="No events published yet"
          description="Check back soon — organizers publish events here once registration opens."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => {
            const prices = event.ticketTypes.map((t) => t.pricePaise);
            const from = prices.length > 0 ? Math.min(...prices) : null;

            return (
              <li key={event.id}>
                <Card className="flex h-full flex-col">
                  <h2 className="text-lg font-semibold text-slate-900">
                    <Link href={`/events/${event.slug}`} className="hover:text-brand-700">
                      {event.title}
                    </Link>
                  </h2>
                  <dl className="mt-2 space-y-1 text-sm text-slate-600">
                    <div className="flex gap-2">
                      <dt className="font-medium text-slate-700">When</dt>
                      <dd>{formatDateTime(event.startsAt)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-slate-700">Where</dt>
                      <dd>{event.venue ?? "To be announced"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-slate-700">From</dt>
                      <dd>{from === null ? "—" : formatPrice(from)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 pt-2">
                    <ButtonLink href={`/events/${event.slug}`} variant="secondary">
                      View
                    </ButtonLink>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
