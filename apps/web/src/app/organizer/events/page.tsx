import Link from "next/link";
import type { Metadata } from "next";
import { prisma, EventStatus, Role, TicketStatus } from "@ct/db";
import { EventStatusActions } from "@/components/event-status-actions";
import { ButtonLink, Card, EmptyState, EventStatusBadge, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Manage events" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { label: "All", value: "" },
  { label: "Draft", value: EventStatus.DRAFT },
  { label: "Published", value: EventStatus.PUBLISHED },
  { label: "Closed", value: EventStatus.CLOSED },
] as const;

type Props = { searchParams: Promise<{ status?: string }> };

export default async function OrganizerEventsPage({ searchParams }: Props) {
  const user = await requireRole([Role.ORGANIZER, Role.ADMIN], "/organizer/events");
  const { status } = await searchParams;

  const statusFilter =
    status && (Object.values(EventStatus) as string[]).includes(status)
      ? (status as EventStatus)
      : undefined;

  const events = await prisma.event.findMany({
    where: {
      // Organizers see only their own events; admins see all.
      ...(user.role === Role.ADMIN ? {} : { createdById: user.id }),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      startsAt: true,
      venue: true,
      capacity: true,
      _count: {
        select: {
          ticketTypes: true,
          tickets: { where: { status: { in: [TicketStatus.ISSUED, TicketStatus.CHECKED_IN] } } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Manage events"
        description={user.role === Role.ADMIN ? "All events across the college." : "Events you created."}
        action={<ButtonLink href="/organizer/events/new">Create event</ButtonLink>}
      />

      <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = (statusFilter ?? "") === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/organizer/events?status=${filter.value}` : "/organizer/events"}
              aria-current={active ? "page" : undefined}
              className={cx(
                "rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
                active
                  ? "border-brand-500 bg-brand-500 font-medium text-[#04231c]"
                  : "border-white/12 bg-white/[0.03] text-slate-700 hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-brand-300",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {events.length === 0 ? (
        <EmptyState
          title="No events match this filter"
          action={<ButtonLink href="/organizer/events/new">Create event</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-medium text-slate-900">
                      <Link href={`/organizer/events/${event.id}/edit`} className="hover:text-brand-400">
                        {event.title}
                      </Link>
                    </h2>
                    <p className="text-sm text-slate-600">
                      {formatDateTime(event.startsAt)}
                      {event.venue ? ` · ${event.venue}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event._count.ticketTypes} ticket type(s) · {event._count.tickets} ticket(s) issued
                      {event.capacity !== null ? ` of ${event.capacity}` : ""}
                    </p>
                  </div>
                  <EventStatusBadge status={event.status} />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-white/8 pt-3">
                  <ButtonLink href={`/organizer/events/${event.id}/edit`} variant="secondary">
                    Edit
                  </ButtonLink>
                  <ButtonLink href={`/organizer/events/${event.id}/attendees`} variant="secondary">
                    View attendees
                  </ButtonLink>
                  <ButtonLink href={`/organizer/events/${event.id}/payments`} variant="secondary">
                    Payments
                  </ButtonLink>
                  <EventStatusActions eventId={event.id} status={event.status} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
