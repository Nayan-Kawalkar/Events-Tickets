import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma, Role } from "@ct/db";
import { ButtonLink, Card, EmptyState, PageHeader, TicketStatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { formatDateTime } from "@/lib/format";
import { uuidSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Attendees" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default async function AttendeesPage({ params, searchParams }: Props) {
  const user = await requireRole([Role.ORGANIZER, Role.ADMIN]);

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) notFound();

  const event = await findManageableEvent(user, idResult.data);
  if (!event) notFound();

  const q = (await searchParams).q?.trim() ?? "";

  const tickets = await prisma.ticket.findMany({
    where: {
      eventId: event.id,
      ...(q
        ? {
            OR: [
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
      owner: { select: { fullName: true, email: true, rollNumber: true } },
      ticketType: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title={`Attendees · ${event.title}`}
        description={`${tickets.length} ticket(s)${q ? " matching your search" : ""}`}
        action={
          <div className="flex gap-2">
            <ButtonLink href={`/organizer/events/${event.id}/edit`} variant="secondary">
              Edit event
            </ButtonLink>
            {/* Full-page navigation so the browser handles the file download. */}
            <ButtonLink href={`/organizer/events/${event.id}/attendees/export`} prefetch={false}>
              Export CSV
            </ButtonLink>
          </div>
        }
      />

      <form method="get" className="mb-5 flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search attendees
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search name, email, roll number or ticket ID"
          className="min-h-11 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50"
        >
          Search
        </button>
        {q ? (
          <Link
            href={`/organizer/events/${event.id}/attendees`}
            className="inline-flex min-h-11 items-center px-2 text-sm text-slate-600 hover:text-brand-700"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {tickets.length === 0 ? (
        <EmptyState
          title={q ? "No attendees match that search" : "No tickets issued yet"}
          description={q ? undefined : "Tickets appear here once students register."}
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">Attendees for {event.title}</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Roll number</th>
                <th scope="col" className="px-4 py-3">Ticket type</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{ticket.owner.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{ticket.owner.email}</td>
                  <td className="px-4 py-3 text-slate-600">{ticket.owner.rollNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{ticket.ticketType.name}</td>
                  <td className="px-4 py-3">
                    <TicketStatusBadge status={ticket.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(ticket.issuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tickets.length === 500 ? (
        <p className="mt-3 text-sm text-slate-500">
          Showing the first 500 tickets. Use search or the CSV export for the full list.
        </p>
      ) : null}
    </>
  );
}
