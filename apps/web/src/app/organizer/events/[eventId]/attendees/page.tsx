import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, Role, TicketStatus } from "@ct/db";
import { FilterChips, ResultCount, SearchBox } from "@/components/list-controls";
import { ManualCheckinButton } from "@/components/manual-checkin";
import { ButtonLink, Card, EmptyState, PageHeader, TicketStatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { formatDateTime } from "@/lib/format";
import { storedAnswers } from "@/lib/attendee-fields";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Attendees" };
export const dynamic = "force-dynamic";

/**
 * Gate-first ordering: on the door the useful question is "who has not come
 * in yet", so that sits next to All rather than at the end.
 */
const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Not arrived", value: TicketStatus.ISSUED },
  { label: "Checked in", value: TicketStatus.CHECKED_IN },
  { label: "Cancelled", value: TicketStatus.CANCELLED },
  { label: "On hold", value: TicketStatus.BLOCKED },
] as const;

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
};

export default async function AttendeesPage({ params, searchParams }: Props) {
  const [user, { eventId }, sp] = await Promise.all([
    requireRole([Role.ORGANIZER, Role.ADMIN]),
    params,
    searchParams,
  ]);

  const idResult = uuidSchema.safeParse(eventId);
  if (!idResult.success) notFound();

  const event = await findManageableEvent(user, idResult.data);
  if (!event) notFound();

  const q = sp.q?.trim() ?? "";
  const status = STATUS_FILTERS.some((f) => f.value && f.value === sp.status)
    ? (sp.status as TicketStatus)
    : "";

  // Unfiltered total, so the count line can say what the filter is hiding.
  const [tickets, totalTickets] = await Promise.all([
    prisma.ticket.findMany({
      relationLoadStrategy: "join",
    where: {
      eventId: event.id,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { attendeeName: { contains: q, mode: "insensitive" } },
              { attendeeEmail: { contains: q, mode: "insensitive" } },
              { attendeeRollNumber: { contains: q, mode: "insensitive" } },
              { attendeePhone: { contains: q, mode: "insensitive" } },
              { owner: { fullName: { contains: q, mode: "insensitive" } } },
              { owner: { email: { contains: q, mode: "insensitive" } } },
              { owner: { rollNumber: { contains: q, mode: "insensitive" } } },
              { publicId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: 500,
    select: {
      id: true,
      publicId: true,
      status: true,
      issuedAt: true,
      attendeeName: true,
      attendeeEmail: true,
      attendeePhone: true,
      customAnswers: true,
      attendeeRollNumber: true,
      owner: { select: { fullName: true, email: true, rollNumber: true } },
      ticketType: { select: { name: true } },
    },
    }),
    prisma.ticket.count({ where: { eventId: event.id } }),
  ]);

  return (
    <>
      <PageHeader
        title={`Attendees · ${event.title}`}
        description={event.venue ?? undefined}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/scanner?event=${event.id}`}>Scan tickets</ButtonLink>
            <ButtonLink href={`/organizer/events/${event.id}/payments`} variant="secondary">
              Payments
            </ButtonLink>
            <ButtonLink href={`/organizer/events/${event.id}`} variant="secondary">
              Event
            </ButtonLink>
            {/* Full-page navigation so the browser handles the file download. */}
            <ButtonLink href={`/organizer/events/${event.id}/attendees/export`} prefetch={false}>
              Export CSV
            </ButtonLink>
          </div>
        }
      />

      <p className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-600">
        <strong className="text-slate-800">Can&apos;t scan a ticket?</strong> Search for the
        attendee and use <strong className="text-slate-800">Check in</strong> — for a dead phone,
        a cracked screen or a QR the camera will not read. Check their college ID first; every
        manual admission is recorded.
      </p>

      <div className="mb-5 space-y-3">
        {/* Search and filter each carry the other through, so narrowing by
            status does not throw away a name someone already typed. */}
        <SearchBox
          action={`/organizer/events/${event.id}/attendees`}
          value={q}
          placeholder="Search name, email, roll number or ticket ID"
          hidden={{ status }}
        />

        <FilterChips
          label="Filter by status"
          basePath={`/organizer/events/${event.id}/attendees`}
          param="status"
          current={status}
          options={STATUS_FILTERS}
          params={{ q }}
        />

        <ResultCount shown={tickets.length} total={totalTickets} noun="ticket" />
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title={q || status ? "No attendees match that view" : "No tickets issued yet"}
          description={q || status ? undefined : "Tickets appear here once students register."}
        />
      ) : (
        <Card className="hidden max-h-[70vh] overflow-auto p-0 md:block" glow={false}>
          {/* The card scrolls, not the page: `overflow-x-auto` already made this
              a scroll container, so a sticky header offset for the site bar
              (`top-16`) landed 64px *inside* the card and covered the first row.
              Giving the card a height and sticking the header at `top-0` makes
              it hold its place over a long list, which is what it was for. */}
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">Attendees for {event.title}</caption>
            <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#0b2a27] text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Roll number</th>
                <th scope="col" className="px-4 py-3">Phone</th>
                <th scope="col" className="px-4 py-3">Ticket type</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Issued</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="row-hover">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {ticket.attendeeName ?? ticket.owner.fullName}
                    {storedAnswers(ticket.customAnswers).length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {storedAnswers(ticket.customAnswers).map((a) => (
                          <li key={a.label} className="text-xs font-normal text-slate-500">
                            <span className="text-slate-600">{a.label}:</span> {a.value}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ticket.attendeeEmail ?? ticket.owner.email}</td>
                  <td className="px-4 py-3 text-slate-600">{ticket.attendeeRollNumber ?? ticket.owner.rollNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{ticket.attendeePhone ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{ticket.ticketType.name}</td>
                  <td className="px-4 py-3">
                    <TicketStatusBadge status={ticket.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(ticket.issuedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {ticket.status === TicketStatus.ISSUED ? (
                      <ManualCheckinButton
                        eventId={event.id}
                        ticketId={ticket.id}
                        attendeeName={ticket.attendeeName ?? ticket.owner.fullName}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Phones get the same data as cards: a 6-column table cannot be read
          on a 375px screen, and horizontal scrolling hides the status. */}
      {tickets.length > 0 ? (
        <ul className="space-y-3 md:hidden">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Card glow={false} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{ticket.attendeeName ?? ticket.owner.fullName}</p>
                  <TicketStatusBadge status={ticket.status} />
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Email</dt>
                    <dd className="truncate text-slate-700">{ticket.attendeeEmail ?? ticket.owner.email}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Roll no.</dt>
                    <dd className="text-slate-700">{ticket.attendeeRollNumber ?? ticket.owner.rollNumber ?? "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Ticket</dt>
                    <dd className="text-slate-700">{ticket.ticketType.name}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Issued</dt>
                    <dd className="text-slate-700">{formatDateTime(ticket.issuedAt)}</dd>
                  </div>
                </dl>
                {ticket.status === TicketStatus.ISSUED ? (
                  <div className="border-t border-white/8 pt-3">
                    <ManualCheckinButton
                      eventId={event.id}
                      ticketId={ticket.id}
                      attendeeName={ticket.attendeeName ?? ticket.owner.fullName}
                    />
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {tickets.length === 500 ? (
        <p className="mt-3 text-sm text-slate-500">
          Showing the first 500 tickets. Use search or the CSV export for the full list.
        </p>
      ) : null}
    </>
  );
}
