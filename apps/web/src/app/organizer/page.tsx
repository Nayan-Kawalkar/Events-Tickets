import type { Metadata } from "next";
import { prisma, EventStatus, ManualPaymentStatus, Role, TicketStatus } from "@ct/db";
import {
  ButtonLink,
  Card,
  EmptyState,
  EventStatusBadge,
  PageHeader,
} from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Organizer dashboard" };
export const dynamic = "force-dynamic";

export default async function OrganizerDashboardPage() {
  const user = await requireRole([Role.ORGANIZER, Role.ADMIN], "/organizer");

  // Admins see the whole college; organizers see only what they created.
  const scope = user.role === Role.ADMIN ? {} : { createdById: user.id };
  const eventScope = user.role === Role.ADMIN ? {} : { event: { createdById: user.id } };

  // One round-trip for the whole dashboard rather than five in series.
  const [eventCount, registrations, checkIns, revenue, pendingPayments, recent] =
    await Promise.all([
      prisma.event.count({ where: scope }),
      prisma.ticket.count({
        where: { ...eventScope, status: { in: [TicketStatus.ISSUED, TicketStatus.CHECKED_IN] } },
      }),
      prisma.ticket.count({ where: { ...eventScope, status: TicketStatus.CHECKED_IN } }),
      prisma.manualPayment.aggregate({
        where: { ...eventScope, status: ManualPaymentStatus.VERIFIED },
        _sum: { amountPaise: true },
      }),
      prisma.manualPayment.count({
        where: { ...eventScope, status: ManualPaymentStatus.PENDING },
      }),
      prisma.event.findMany({
        where: scope,
        orderBy: { startsAt: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          _count: {
            select: {
              tickets: { where: { status: { in: [TicketStatus.ISSUED, TicketStatus.CHECKED_IN] } } },
            },
          },
        },
      }),
    ]);

  const kpis = [
    { label: "Events", value: String(eventCount) },
    { label: "Registrations", value: String(registrations) },
    { label: "Check-ins", value: String(checkIns) },
    { label: "Revenue", value: formatPrice(revenue._sum.amountPaise ?? 0) },
  ];

  return (
    <>
      <PageHeader
        title="Organizer dashboard"
        description={user.role === Role.ADMIN ? "Across all events." : "Your events at a glance."}
        action={<ButtonLink href="/organizer/events/new">Create Event</ButtonLink>}
      />

      <section aria-labelledby="kpis" className="mb-10">
        <h2 id="kpis" className="sr-only">
          Key numbers
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {kpi.label}
              </p>
              <p className="mt-2 font-display text-3xl font-normal text-slate-900">{kpi.value}</p>
            </Card>
          ))}
        </div>
      </section>

      {pendingPayments > 0 ? (
        <div className="mb-10">
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-900">
                {pendingPayments} payment{pendingPayments === 1 ? "" : "s"} awaiting verification
              </p>
              <p className="text-sm text-slate-600">
                Students are waiting for their tickets until you verify these.
              </p>
            </div>
            <ButtonLink href="/organizer/events">Review events</ButtonLink>
          </Card>
        </div>
      ) : null}

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="font-display text-xl font-normal text-slate-900">
            Upcoming events
          </h2>
          <ButtonLink href="/organizer/events" variant="secondary">
            View all
          </ButtonLink>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            title="No events yet"
            description="Create your first event to start issuing tickets."
            action={<ButtonLink href="/organizer/events/new">Create Event</ButtonLink>}
          />
        ) : (
          <ul className="space-y-3">
            {recent.map((event) => (
              <li key={event.id}>
                <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{event.title}</p>
                    <p className="text-sm text-slate-600">{formatDateTime(event.startsAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span>{event._count.tickets} registered</span>
                    <EventStatusBadge status={event.status} />
                    <ButtonLink href={`/organizer/events/${event.id}/edit`} variant="secondary">
                      Manage
                    </ButtonLink>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
