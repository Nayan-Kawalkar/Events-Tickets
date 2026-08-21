import Link from "next/link";
import type { Metadata } from "next";
import { prisma, Role } from "@ct/db";
import {
  Alert,
  ButtonLink,
  Card,
  EmptyState,
  EventStatusBadge,
  PageHeader,
  TicketStatusBadge,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const user = await requireUser("/dashboard");
  const { error } = await searchParams;
  const isOrganizer = user.role === Role.ORGANIZER || user.role === Role.ADMIN;

  return (
    <>
      <PageHeader title={`Hello, ${user.fullName}`} description={`Signed in as ${user.email}`} />

      {error === "forbidden" ? (
        <div className="mb-6">
          <Alert>You do not have access to that page.</Alert>
        </div>
      ) : null}

      {!user.rollNumber ? (
        <div className="mb-6">
          <Alert tone="info">
            Add your roll number to register for student-only tickets.{" "}
            <Link href="/profile" className="font-medium underline">
              Update your profile
            </Link>
            .
          </Alert>
        </div>
      ) : null}

      {isOrganizer ? <OrganizerSummary userId={user.id} isAdmin={user.role === Role.ADMIN} /> : null}
      <StudentTickets userId={user.id} />
    </>
  );
}

async function OrganizerSummary({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  // Admins see everything; organizers see only what they created.
  const where = isAdmin ? {} : { createdById: userId };

  const events = await prisma.event.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: 5,
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      startsAt: true,
      _count: { select: { tickets: true } },
    },
  });

  return (
    <section aria-labelledby="my-events" className="mb-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="my-events" className="font-display text-xl font-normal text-slate-900">
          {isAdmin ? "All events" : "Events you created"}
        </h2>
        <ButtonLink href="/organizer/events" variant="secondary">
          Manage events
        </ButtonLink>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event to start issuing tickets."
          action={<ButtonLink href="/organizer/events/new">Create event</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link
                    href={`/organizer/events/${event.id}/edit`}
                    className="font-medium text-slate-900 hover:text-brand-400"
                  >
                    {event.title}
                  </Link>
                  <p className="text-sm text-slate-600">{formatDateTime(event.startsAt)}</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>{event._count.tickets} ticket(s)</span>
                  <EventStatusBadge status={event.status} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function StudentTickets({ userId }: { userId: string }) {
  const tickets = await prisma.ticket.findMany({
    // A user can only ever read their own tickets.
    where: { ownerUserId: userId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      publicId: true,
      status: true,
      issuedAt: true,
      event: { select: { title: true, slug: true, startsAt: true } },
      ticketType: { select: { name: true } },
    },
  });

  return (
    <section aria-labelledby="my-tickets">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="my-tickets" className="font-display text-xl font-normal text-slate-900">
          My tickets
        </h2>
        <ButtonLink href="/tickets" variant="secondary">
          All tickets
        </ButtonLink>
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          description="Once registration opens, your tickets will appear here."
          action={<ButtonLink href="/" variant="secondary">Browse events</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{ticket.event.title}</p>
                  <p className="text-sm text-slate-600">
                    {ticket.ticketType.name} · {formatDateTime(ticket.event.startsAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Issued {formatDateTime(ticket.issuedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <TicketStatusBadge status={ticket.status} />
                  <ButtonLink href={`/tickets/${ticket.publicId}`} variant="secondary">
                    View ticket
                  </ButtonLink>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
