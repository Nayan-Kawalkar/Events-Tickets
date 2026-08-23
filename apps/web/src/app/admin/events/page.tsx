import type { Metadata } from "next";
import { prisma, EventStatus, ManualPaymentStatus, Role, TicketStatus } from "@ct/db";
import { AdminEventActions } from "@/components/admin-actions";
import { FilterChips, ResultCount, SearchBox } from "@/components/list-controls";
import { ButtonLink, Card, EmptyState, EventStatusBadge, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Events · Admin" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Draft", value: EventStatus.DRAFT },
  { label: "Published", value: EventStatus.PUBLISHED },
  { label: "Closed", value: EventStatus.CLOSED },
  { label: "Past", value: EventStatus.COMPLETED },
  { label: "Cancelled", value: EventStatus.CANCELLED },
] as const;

type Props = { searchParams: Promise<{ q?: string; status?: string }> };

export default async function AdminEventsPage({ searchParams }: Props) {
  const [, sp] = await Promise.all([requireRole([Role.ADMIN]), searchParams]);

  const q = sp.q?.trim() ?? "";
  const status = STATUS_FILTERS.some((f) => f.value && f.value === sp.status)
    ? (sp.status as EventStatus)
    : "";

  const [events, totalEvents] = await Promise.all([
    prisma.event.findMany({
    where: {
      ...(status ? { status } : {}),
      // Title, slug or venue — an admin is usually hunting a name they
      // half-remember from a support message.
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
              { venue: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { startsAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      startsAt: true,
      venue: true,
      capacity: true,
      createdBy: { select: { fullName: true, email: true } },
      _count: {
        select: {
          tickets: true,
          manualPayments: { where: { status: ManualPaymentStatus.PENDING } },
        },
      },
    },
    }),
    prisma.event.count(),
  ]);

  const checkedIn = await prisma.ticket.groupBy({
    by: ["eventId"],
    where: { status: TicketStatus.CHECKED_IN },
    _count: { _all: true },
  });
  const checkedInByEvent = new Map(checkedIn.map((row) => [row.eventId, row._count._all]));

  return (
    <>
      <PageHeader title="Events" description="Every event across the college." />

      <div className="mb-5 space-y-3">
        <SearchBox
          action="/admin/events"
          value={q}
          placeholder="Search by title, slug or venue"
          hidden={{ status }}
        />

        <FilterChips
          label="Filter by status"
          basePath="/admin/events"
          param="status"
          current={status}
          options={STATUS_FILTERS}
          params={{ q }}
        />

        <ResultCount shown={events.length} total={totalEvents} noun="event" />
      </div>

      {events.length === 0 ? (
        <EmptyState title={q || status ? "No events match that view" : "No events yet"} />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card glow={false} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{event.title}</p>
                    <p className="text-sm text-slate-600">
                      {formatDateTime(event.startsAt)}
                      {event.venue ? ` · ${event.venue}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      by {event.createdBy.fullName} · {event._count.tickets} ticket(s)
                      {event.capacity !== null ? ` of ${event.capacity}` : ""} ·{" "}
                      {checkedInByEvent.get(event.id) ?? 0} checked in
                    </p>
                    {event._count.manualPayments > 0 ? (
                      <p className="mt-1 text-xs text-amber-300">
                        {event._count.manualPayments} payment(s) awaiting verification
                      </p>
                    ) : null}
                  </div>
                  <EventStatusBadge status={event.status} />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-white/8 pt-3">
                  <ButtonLink href={`/organizer/events/${event.id}/edit`} variant="secondary">
                    Edit
                  </ButtonLink>
                  <ButtonLink href={`/organizer/events/${event.id}/attendees`} variant="secondary">
                    Attendees
                  </ButtonLink>
                  <ButtonLink href={`/organizer/events/${event.id}/payments`} variant="secondary">
                    Payments
                  </ButtonLink>
                  <AdminEventActions
                    eventId={event.id}
                    status={event.status}
                    ticketCount={event._count.tickets}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
