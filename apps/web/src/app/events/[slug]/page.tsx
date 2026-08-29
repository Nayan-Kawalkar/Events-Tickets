import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, EventStatus, ManualPaymentStatus, PaymentMode, TicketStatus } from "@ct/db";
import { HostControls } from "@/components/host-controls";
import {
  AddToCalendar,
  ContactCard,
  HostsSection,
  LocationCard,
} from "@/components/event-details";
import { Poster } from "@/components/poster";
import { Alert, ButtonLink, Card, EventStatusBadge, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { canManageEvent } from "@/lib/authz";
import { getEventBySlug } from "@/lib/event-cache";
import { effectiveStatus } from "@/lib/event-status";
import { formatDateTime, formatPrice } from "@/lib/format";
import { LIVE_TICKET_STATUS_LIST } from "@/lib/ticket-status";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  return { title: event?.title ?? "Event not found" };
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  // Independent queries: issue them together rather than paying two
  // round-trips to the database in series.
  const [event, user] = await Promise.all([getEventBySlug(slug), getCurrentUser()]);
  if (!event) notFound();

  const isHost = user ? canManageEvent(user, event) : false;

  // Derived, not stored: an event that has just ended must read COMPLETED even
  // before the write-back on the next listing runs.
  const status = effectiveStatus(event);

  // A draft or cancelled event is reachable only by whoever hosts it, so an
  // organizer can open their own event from the same link everyone else uses.
  const publiclyVisible =
    status === EventStatus.PUBLISHED ||
    status === EventStatus.CLOSED ||
    status === EventStatus.COMPLETED;
  if (!publiclyVisible && !isHost) notFound();

  const now = new Date();

  const registrationOpen =
    status === EventStatus.PUBLISHED &&
    (!event.registrationOpensAt || event.registrationOpensAt <= now) &&
    (!event.registrationClosesAt || event.registrationClosesAt > now);

  const eventFull = event.capacity !== null && event._count.tickets >= event.capacity;

  // Tickets this user already holds, so the page can show "You have this ticket"
  // rather than a button the server will refuse.
  const heldByType = new Map<string, number>();
  const pendingPayment = new Set<string>();
  let myTicket: { publicId: string } | null = null;
  if (user) {
    // All three need only user.id and event.id, so they go out together. Run
    // in series they cost three round-trip waves instead of one, which on a
    // pooled connection is most of what made opening an event feel slow.
    const [held, claims, myTicketRow] = await Promise.all([
      prisma.ticket.groupBy({
        by: ["ticketTypeId"],
        where: {
          ownerUserId: user.id,
          eventId: event.id,
          status: { in: LIVE_TICKET_STATUS_LIST },
        },
        _count: { _all: true },
      }),
      prisma.manualPayment.findMany({
        where: { userId: user.id, eventId: event.id, status: ManualPaymentStatus.PENDING },
        select: { ticketTypeId: true },
      }),
      prisma.ticket.findFirst({
        where: {
          ownerUserId: user.id,
          eventId: event.id,
          status: { in: LIVE_TICKET_STATUS_LIST },
        },
        orderBy: { issuedAt: "desc" },
        select: { publicId: true },
      }),
    ]);
    for (const row of held) heldByType.set(row.ticketTypeId, row._count._all);
    for (const claim of claims) pendingPayment.add(claim.ticketTypeId);
    myTicket = myTicketRow;
  }

  // Numbers only a host sees, fetched only for a host.
  const hostStats = isHost
    ? await prisma.$transaction([
        prisma.ticket.count({
          where: { eventId: event.id, status: { in: LIVE_TICKET_STATUS_LIST } },
        }),
        prisma.ticket.count({ where: { eventId: event.id, status: TicketStatus.CHECKED_IN } }),
        prisma.manualPayment.count({
          where: { eventId: event.id, status: ManualPaymentStatus.PENDING },
        }),
        prisma.manualPayment.aggregate({
          where: { eventId: event.id, status: ManualPaymentStatus.VERIFIED },
          _sum: { amountPaise: true },
        }),
      ])
    : null;

  /** Mirrors the server's rules so the UI explains itself. The server decides. */
  const refusalFor = (type: (typeof event.ticketTypes)[number]): string | undefined => {
    if (!registrationOpen) {
      if (status === EventStatus.COMPLETED) return "Event finished";
      if (event.registrationOpensAt && event.registrationOpensAt > now) return "Opens soon";
      return "Registration closed";
    }
    if (type.salesStartAt && type.salesStartAt > now) return "Not on sale yet";
    if (type.salesEndAt && type.salesEndAt <= now) return "Sales closed";
    if (pendingPayment.has(type.id)) {
      // Nothing was paid for a free seat, so calling it a payment is confusing.
      return type.pricePaise === 0 ? "Waiting for approval" : "Payment awaiting verification";
    }
    if (type.pricePaise > 0 && type.paymentMode !== PaymentMode.MANUAL_UPI) {
      return "Paid tickets coming soon";
    }
    if (type.paymentMode === PaymentMode.MANUAL_UPI && !type.organizerUpiId) {
      return "Payment details not set up";
    }
    if (type.capacity !== null && type._count.tickets >= type.capacity) return "Sold out";
    if (eventFull) return "Event full";

    const held = heldByType.get(type.id) ?? 0;
    if (held >= type.maxPerUser) return held === 1 ? "You have this ticket" : "Limit reached";
    // A missing profile roll number is NOT a refusal: student-only tickets ask
    // for it on the registration form, which is also what the gate checks.
    return undefined;
  };

  return (
    <>
      {/* Poster hero: full-bleed on mobile, with the title over the gradient. */}
      <section className="animate-rise mb-8 overflow-hidden rounded-2xl border border-white/8 bg-[#09201e]/90 shadow-xl shadow-black/40">
        <div className="relative">
          <Poster
            uploadId={event.posterUploadId}
            title={event.title}
            ratio="wide"
            priority
            sizes="100vw"
            className="rounded-none"
          />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <EventStatusBadge status={status} />
              {event.hostOrganization ? (
                <span className="text-xs font-medium text-brand-300">{event.hostOrganization}</span>
              ) : null}
              {event.venue ? <span className="text-xs text-slate-700">{event.venue}</span> : null}
            </div>
            <h1 className="text-display-lg text-slate-900 drop-shadow-lg">{event.title}</h1>
          </div>
        </div>
      </section>

      {isHost && hostStats ? (
        <HostControls
          eventId={event.id}
          status={status}
          registered={hostStats[0]}
          checkedIn={hostStats[1]}
          pendingPayments={hostStats[2]}
          revenuePaise={hostStats[3]._sum.amountPaise ?? 0}
        />
      ) : null}

      {/* Already registered: say so, and put the ticket one tap away. */}
      {myTicket ? (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-brand-500/40 bg-brand-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-medium text-brand-200">
            <span aria-hidden="true">✓</span>
            You&apos;re going
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/tickets/${myTicket.publicId}`}>My ticket</ButtonLink>
            <AddToCalendar
              title={event.title}
              startsAt={event.startsAt}
              endsAt={event.endsAt}
              location={[event.venue, event.addressLine].filter(Boolean).join(", ")}
              details={event.description ?? undefined}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1.6fr_1fr] lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-eyebrow">About</h2>
            <p className="prose-measure mt-3 whitespace-pre-line text-slate-700">
              {event.description ?? "Details will be announced shortly."}
            </p>
          </Card>

          <section aria-labelledby="ticket-types">
            <h2 id="ticket-types" className="text-display mb-4 text-slate-900">
              Tickets
            </h2>

            {event.ticketTypes.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-600">No ticket types have been set up yet.</p>
              </Card>
            ) : (
              <ul className="space-y-3">
                {event.ticketTypes.map((type) => {
                  const remaining =
                    type.capacity === null ? null : Math.max(0, type.capacity - type._count.tickets);

                  return (
                    <li key={type.id}>
                      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{type.name}</p>
                          {type.description ? (
                            <p className="mt-1 text-sm text-slate-600">{type.description}</p>
                          ) : null}
                          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <li>Max {type.maxPerUser} per person</li>
                            <li>{type.requiresStudentId ? "College ID required" : "Open to guests"}</li>
                            <li>{type.transferable ? "Transferable" : "Non-transferable"}</li>
                            {remaining !== null ? <li>{remaining} left</li> : null}
                          </ul>
                        </div>

                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          <p className="text-base font-semibold text-slate-900">
                            {formatPrice(type.pricePaise)}
                          </p>
                          {user ? (
                            // A free seat the organizer vets goes through the
                            // same request-and-wait flow as a UPI payment.
                            type.pricePaise === 0 && type.requiresApproval ? (
                              refusalFor(type) ? (
                                <p className="text-sm font-medium text-slate-500" role="status">
                                  {refusalFor(type)}
                                </p>
                              ) : (
                                <ButtonLink href={`/events/${slug}/pay/${type.id}`}>
                                  Request a seat
                                </ButtonLink>
                              )
                            ) : type.paymentMode === PaymentMode.MANUAL_UPI ? (
                              refusalFor(type) ? (
                                <p className="text-sm font-medium text-slate-500" role="status">
                                  {refusalFor(type)}
                                </p>
                              ) : (
                                <ButtonLink href={`/events/${slug}/pay/${type.id}`}>
                                  Pay by UPI
                                </ButtonLink>
                              )
                            ) : refusalFor(type) ? (
                              <p className="text-sm font-medium text-slate-500" role="status">
                                {refusalFor(type)}
                              </p>
                            ) : (
                              <ButtonLink href={`/events/${slug}/register/${type.id}`}>
                                Register
                              </ButtonLink>
                            )
                          ) : (
                            <ButtonLink href={`/login?next=/events/${slug}`} variant="secondary">
                              Sign in to register
                            </ButtonLink>
                          )}
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <HostsSection hosts={event.hosts} />
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Schedule</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div>
                <dt className="font-medium text-slate-700">Starts</dt>
                <dd className="text-slate-600">{formatDateTime(event.startsAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Ends</dt>
                <dd className="text-slate-600">{formatDateTime(event.endsAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Registration closes</dt>
                <dd className="text-slate-600">{formatDateTime(event.registrationClosesAt)}</dd>
              </div>
              {event.capacity !== null ? (
                <div>
                  <dt className="font-medium text-slate-700">Capacity</dt>
                  <dd className="text-slate-600">
                    {event._count.tickets} of {event.capacity} registered
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <LocationCard
            location={{
              venue: event.venue,
              addressLine: event.addressLine,
              latitude: event.latitude,
              longitude: event.longitude,
            }}
          />

          <ContactCard
            contact={{ contactEmail: event.contactEmail, contactPhone: event.contactPhone }}
          />

          {!registrationOpen ? (
            <Alert tone="info">Registration is not open for this event right now.</Alert>
          ) : null}

          {user && !user.rollNumber ? (
            <Alert tone="info">
              Student-only tickets ask for a roll number when you register. Save it to your{" "}
              <Link href="/profile" className="font-medium underline">
                profile
              </Link>{" "}
              to have it filled in automatically.
            </Alert>
          ) : null}
        </aside>
      </div>
    </>
  );
}
