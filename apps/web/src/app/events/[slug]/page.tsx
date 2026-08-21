import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, EventStatus, ManualPaymentStatus, PaymentMode } from "@ct/db";
import { Poster } from "@/components/poster";
import { RegisterButton } from "@/components/register-button";
import { Alert, ButtonLink, Card, EventStatusBadge, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { LIVE_TICKET_STATUS_LIST } from "@/lib/ticket-status";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function loadEvent(slug: string) {
  return prisma.event.findFirst({
    // Draft and cancelled events must not be reachable by guessing the slug.
    where: { slug, status: { in: [EventStatus.PUBLISHED, EventStatus.CLOSED, EventStatus.COMPLETED] } },
    select: {
      id: true,
      title: true,
      description: true,
      venue: true,
      startsAt: true,
      endsAt: true,
      registrationOpensAt: true,
      registrationClosesAt: true,
      status: true,
      capacity: true,
      posterUploadId: true,
      _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
      ticketTypes: {
        orderBy: { pricePaise: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          pricePaise: true,
          capacity: true,
          salesStartAt: true,
          salesEndAt: true,
          requiresStudentId: true,
          transferable: true,
          maxPerUser: true,
          paymentMode: true,
          organizerUpiId: true,
          _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await loadEvent((await params).slug);
  return { title: event?.title ?? "Event not found" };
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  // Independent queries: issue them together rather than paying two
  // round-trips to the database in series.
  const [event, user] = await Promise.all([loadEvent(slug), getCurrentUser()]);
  if (!event) notFound();

  const now = new Date();

  const registrationOpen =
    event.status === EventStatus.PUBLISHED &&
    (!event.registrationOpensAt || event.registrationOpensAt <= now) &&
    (!event.registrationClosesAt || event.registrationClosesAt > now);

  const eventFull = event.capacity !== null && event._count.tickets >= event.capacity;

  // Tickets this user already holds, so the page can show "You have this ticket"
  // rather than a button the server will refuse.
  const heldByType = new Map<string, number>();
  const pendingPayment = new Set<string>();
  if (user) {
    const [held, claims] = await Promise.all([
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
    ]);
    for (const row of held) heldByType.set(row.ticketTypeId, row._count._all);
    for (const claim of claims) pendingPayment.add(claim.ticketTypeId);
  }

  /** Mirrors the server's rules so the UI explains itself. The server decides. */
  const refusalFor = (type: (typeof event.ticketTypes)[number]): string | undefined => {
    if (!registrationOpen) {
      if (event.registrationOpensAt && event.registrationOpensAt > now) return "Opens soon";
      return "Registration closed";
    }
    if (type.salesStartAt && type.salesStartAt > now) return "Not on sale yet";
    if (type.salesEndAt && type.salesEndAt <= now) return "Sales closed";
    if (pendingPayment.has(type.id)) return "Payment awaiting verification";
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
    if (type.requiresStudentId && !user?.rollNumber) return "Add your roll number to register";
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
              <EventStatusBadge status={event.status} />
              {event.venue ? (
                <span className="text-xs text-slate-700">{event.venue}</span>
              ) : null}
            </div>
            <h1 className="text-display-lg text-slate-900 drop-shadow-lg">{event.title}</h1>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
                      <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
                            type.paymentMode === PaymentMode.MANUAL_UPI ? (
                              refusalFor(type) ? (
                                <p className="text-sm font-medium text-slate-500" role="status">
                                  {refusalFor(type)}
                                </p>
                              ) : (
                                <ButtonLink href={`/events/${slug}/pay/${type.id}`}>
                                  Pay by UPI
                                </ButtonLink>
                              )
                            ) : (
                              <RegisterButton
                                eventId={event.id}
                                ticketTypeId={type.id}
                                disabledReason={refusalFor(type)}
                              />
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

          {!registrationOpen ? (
            <Alert tone="info">Registration is not open for this event right now.</Alert>
          ) : null}

          {user && !user.rollNumber ? (
            <Alert tone="info">
              Student-only tickets need a roll number on your profile.{" "}
              <Link href="/dashboard" className="font-medium underline">
                Add it now
              </Link>
              .
            </Alert>
          ) : null}
        </aside>
      </div>
    </>
  );
}
