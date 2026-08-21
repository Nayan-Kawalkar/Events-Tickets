import type { Metadata } from "next";
import { prisma, Role, TicketStatus } from "@ct/db";
import { AdminTicketActions } from "@/components/admin-actions";
import { Card, EmptyState, PageHeader, TicketStatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Tickets · Admin" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; status?: string }> };

export default async function AdminTicketsPage({ searchParams }: Props) {
  const [, sp] = await Promise.all([requireRole([Role.ADMIN]), searchParams]);

  const q = sp.q?.trim() ?? "";
  const statusFilter =
    sp.status && (Object.values(TicketStatus) as string[]).includes(sp.status)
      ? (sp.status as TicketStatus)
      : undefined;

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { publicId: { contains: q, mode: "insensitive" } },
              { owner: { fullName: { contains: q, mode: "insensitive" } } },
              { owner: { email: { contains: q, mode: "insensitive" } } },
              { owner: { rollNumber: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: 100,
    select: {
      id: true,
      publicId: true,
      status: true,
      issuedAt: true,
      checkedInAt: true,
      owner: { select: { fullName: true, email: true, rollNumber: true } },
      event: { select: { title: true } },
      ticketType: { select: { name: true } },
    },
  });

  const filters = [
    { label: "All", value: "" },
    ...Object.values(TicketStatus).map((value) => ({ label: value.replace("_", " "), value })),
  ];

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Find any ticket and block, cancel, reinstate or reissue it."
      />

      <form method="get" className="mb-5 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search tickets
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Ticket code, name, email or roll number"
          className="min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500 sm:max-w-md"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-lg border border-white/12 bg-white/[0.03] px-4 text-sm font-medium text-slate-800 transition-colors hover:border-brand-500/60 hover:text-brand-300"
        >
          Search
        </button>
      </form>

      <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = (statusFilter ?? "") === filter.value;
          const href = filter.value ? `/admin/tickets?status=${filter.value}` : "/admin/tickets";
          return (
            <a
              key={filter.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-full border border-brand-500 bg-brand-500 px-3 py-1.5 text-sm font-medium text-[#04231c]"
                  : "rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-brand-500/50 hover:text-brand-300"
              }
            >
              {filter.label.toLowerCase()}
            </a>
          );
        })}
      </nav>

      {tickets.length === 0 ? (
        <EmptyState
          title={q ? "No tickets match" : "No tickets issued yet"}
          description={q ? "Try a different search." : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Card glow={false} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{ticket.owner.fullName}</p>
                    <p className="truncate text-sm text-slate-600">
                      {ticket.event.title} · {ticket.ticketType.name}
                    </p>
                    <p className="text-code mt-1 truncate text-slate-500">{ticket.publicId}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {ticket.owner.email}
                      {ticket.owner.rollNumber ? ` · ${ticket.owner.rollNumber}` : ""} · issued{" "}
                      {formatDateTime(ticket.issuedAt)}
                      {ticket.checkedInAt ? ` · used ${formatDateTime(ticket.checkedInAt)}` : ""}
                    </p>
                  </div>
                  <TicketStatusBadge status={ticket.status} />
                </div>

                <div className="border-t border-white/8 pt-3">
                  <AdminTicketActions ticketId={ticket.id} status={ticket.status} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {tickets.length === 100 ? (
        <p className="mt-3 text-sm text-slate-500">Showing the 100 most recent. Use search to narrow.</p>
      ) : null}
    </>
  );
}
