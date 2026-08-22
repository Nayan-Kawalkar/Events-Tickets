import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, MapPin, PenLine, QrCode, Users, Wallet } from "lucide-react";
import { prisma, ManualPaymentStatus, Role, TicketStatus } from "@ct/db";
import { EventStatusActions } from "@/components/event-status-actions";
import { Poster } from "@/components/poster";
import { ButtonLink, Card, EventStatusBadge, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { formatDateTime, formatPrice } from "@/lib/format";
import { LIVE_TICKET_STATUS_LIST } from "@/lib/ticket-status";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Event" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ eventId: string }> };

export default async function EventHubPage({ params }: Props) {
  const [user, { eventId }] = await Promise.all([
    requireRole([Role.ORGANIZER, Role.ADMIN]),
    params,
  ]);

  const idResult = uuidSchema.safeParse(eventId);
  if (!idResult.success) notFound();

  // Returns null for events this organizer does not own, so a guessed id 404s.
  const event = await findManageableEvent(user, idResult.data);
  if (!event) notFound();

  const [registrations, checkedIn, pendingPayments, revenue, ticketTypes, hosts] =
    await Promise.all([
      prisma.ticket.count({ where: { eventId: event.id, status: { in: LIVE_TICKET_STATUS_LIST } } }),
      prisma.ticket.count({ where: { eventId: event.id, status: TicketStatus.CHECKED_IN } }),
      prisma.manualPayment.count({
        where: { eventId: event.id, status: ManualPaymentStatus.PENDING },
      }),
      prisma.manualPayment.aggregate({
        where: { eventId: event.id, status: ManualPaymentStatus.VERIFIED },
        _sum: { amountPaise: true },
      }),
      prisma.ticketType.findMany({
        where: { eventId: event.id },
        orderBy: { pricePaise: "asc" },
        select: {
          id: true,
          name: true,
          pricePaise: true,
          capacity: true,
          _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
        },
      }),
      prisma.eventHost.findMany({
        where: { eventId: event.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, title: true },
      }),
    ]);

  const kpis = [
    { label: "Registered", value: String(registrations) },
    { label: "Checked in", value: String(checkedIn) },
    { label: "Awaiting payment", value: String(pendingPayments) },
    { label: "Revenue", value: formatPrice(revenue._sum.amountPaise ?? 0) },
  ];

  // The four things an organizer does with an event, one tap each.
  const actions = [
    {
      href: `/organizer/events/${event.id}/edit`,
      label: "Edit details",
      hint: "Title, poster, location, tickets, hosts, volunteers",
      Icon: PenLine,
    },
    {
      href: `/organizer/events/${event.id}/attendees`,
      label: "Guest list",
      hint: `${registrations} registered · export CSV`,
      Icon: Users,
    },
    {
      href: `/organizer/events/${event.id}/payments`,
      label: "Payments",
      hint: pendingPayments > 0 ? `${pendingPayments} awaiting verification` : "All verified",
      Icon: Wallet,
      badge: pendingPayments > 0,
    },
    {
      // Pre-selects this event, so the gate cannot be left on the wrong one.
      href: `/scanner?event=${event.id}`,
      label: "Scan tickets",
      hint: "Open the gate scanner for this event",
      Icon: QrCode,
    },
  ];

  return (
    <>
      <PageHeader
        title={event.title}
        description={event.hostOrganization ?? undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/events/${event.slug}`} variant="secondary">
              View public page
            </ButtonLink>
            <EventStatusActions eventId={event.id} status={event.status} />
          </div>
        }
      />

      <Card glow={false} className="mb-8 flex flex-col gap-4 p-4 sm:flex-row">
        <Poster
          uploadId={event.posterUploadId}
          title={event.title}
          sizes="220px"
          className="w-full shrink-0 sm:w-56"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <EventStatusBadge status={event.status} />
            {event.hostOrganization ? (
              <span className="text-xs font-medium text-brand-300">{event.hostOrganization}</span>
            ) : null}
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="sr-only">When</dt>
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden="true" />
              <dd className="text-slate-700">
                {formatDateTime(event.startsAt)} — {formatDateTime(event.endsAt)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="sr-only">Where</dt>
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden="true" />
              <dd className="text-slate-700">
                {event.venue ?? "Venue to be announced"}
                {event.addressLine ? (
                  <span className="block text-xs text-slate-500">{event.addressLine}</span>
                ) : null}
              </dd>
            </div>
          </dl>

          {hosts.length > 0 ? (
            <p className="text-xs text-slate-500">
              Hosts: {hosts.map((h) => (h.title ? `${h.name} (${h.title})` : h.name)).join(", ")}
            </p>
          ) : null}

          <p className="text-xs text-slate-500">
            {registrations}
            {event.capacity !== null ? ` of ${event.capacity}` : ""} registered ·{" "}
            <Link href={`/events/${event.slug}`} className="text-brand-400 hover:underline">
              /events/{event.slug}
            </Link>
          </p>
        </div>
      </Card>

      <section aria-labelledby="numbers" className="mb-8">
        <h2 id="numbers" className="sr-only">
          Key numbers
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="py-4">
              <p className="text-eyebrow">{kpi.label}</p>
              <p className="mt-2 font-display text-3xl text-slate-900">{kpi.value}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="manage" className="mb-8">
        <h2 id="manage" className="text-display mb-4 text-slate-900">
          Manage
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className={cx(
                  "spotlight card-interactive flex items-center gap-4 rounded-xl border bg-[#09201e]/90 p-4 shadow-lg shadow-black/40",
                  action.badge ? "border-amber-400/40" : "border-white/8",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300"
                >
                  <action.Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{action.label}</span>
                  <span
                    className={cx(
                      "block text-xs",
                      action.badge ? "text-amber-300" : "text-slate-500",
                    )}
                  >
                    {action.hint}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="types">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="types" className="text-display text-slate-900">
            Ticket types
          </h2>
          <ButtonLink href={`/organizer/events/${event.id}/edit`} variant="secondary">
            Edit
          </ButtonLink>
        </div>

        {ticketTypes.length === 0 ? (
          <Card glow={false}>
            <p className="text-sm text-slate-600">
              No ticket types yet — nobody can register until you add one.
            </p>
          </Card>
        ) : (
          <Card glow={false} className="p-0">
            <ul className="divide-y divide-white/6">
              {ticketTypes.map((type) => (
                <li key={type.id} className="row-hover flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{type.name}</p>
                    <p className="text-xs text-slate-500">
                      {type._count.tickets}
                      {type.capacity !== null ? ` of ${type.capacity}` : ""} sold
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-slate-700">
                    {formatPrice(type.pricePaise)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
