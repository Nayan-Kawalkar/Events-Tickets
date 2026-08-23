import Link from "next/link";
import type { Metadata } from "next";
import { prisma, EventStatus, ManualPaymentStatus, Role, TicketStatus } from "@ct/db";
import { ButtonLink, Card, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { syncCompletedEvents } from "@/lib/event-status";
import { formatDateTime, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

/** Rolling window used by the monitoring panels. */
const WINDOW_HOURS = 24;

export default async function AdminOverviewPage() {
  // Checked here, not only in the layout: Next renders layouts and pages in
  // parallel, so a layout-only guard still lets this page run its queries and
  // stream the results before the redirect lands.
  await requireRole([Role.ADMIN], "/admin");

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

  // Forced past the throttle: this is the monitoring view, so its numbers are
  // worth one extra round-trip. Awaited before the counts, never alongside them.
  await syncCompletedEvents(true);

  const [
    users,
    admins,
    organizers,
    events,
    published,
    tickets,
    checkedIn,
    blocked,
    revenue,
    pendingPayments,
    failedLogins,
    failedScans,
    recentActivity,
    recentScans,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: Role.ADMIN } }),
    prisma.user.count({ where: { role: Role.ORGANIZER } }),
    prisma.event.count(),
    prisma.event.count({ where: { status: EventStatus.PUBLISHED } }),
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: TicketStatus.CHECKED_IN } }),
    prisma.ticket.count({ where: { status: TicketStatus.BLOCKED } }),
    prisma.manualPayment.aggregate({
      where: { status: ManualPaymentStatus.VERIFIED },
      _sum: { amountPaise: true },
    }),
    prisma.manualPayment.count({ where: { status: ManualPaymentStatus.PENDING } }),
    prisma.auditLog.count({ where: { action: "USER_LOGIN_FAILED", createdAt: { gte: since } } }),
    prisma.checkinAttempt.count({ where: { result: "REJECTED", createdAt: { gte: since } } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
        actor: { select: { fullName: true, email: true } },
      },
    }),
    prisma.checkinAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        result: true,
        reason: true,
        gateId: true,
        createdAt: true,
        event: { select: { title: true } },
      },
    }),
  ]);

  const kpis = [
    { label: "Users", value: String(users), note: `${admins} admin · ${organizers} organizer` },
    { label: "Events", value: String(events), note: `${published} published` },
    { label: "Tickets", value: String(tickets), note: `${checkedIn} checked in` },
    { label: "Revenue", value: formatPrice(revenue._sum.amountPaise ?? 0), note: "verified UPI" },
  ];

  // Anything here needs a human to look at it.
  const alerts = [
    pendingPayments > 0
      ? {
          tone: "warn" as const,
          text: `${pendingPayments} UPI payment${pendingPayments === 1 ? "" : "s"} awaiting verification`,
          href: "/admin/events",
        }
      : null,
    failedLogins > 10
      ? {
          tone: "warn" as const,
          text: `${failedLogins} failed sign-ins in the last ${WINDOW_HOURS}h`,
          href: "/admin/logs",
        }
      : null,
    failedScans > 0
      ? {
          tone: "info" as const,
          text: `${failedScans} rejected scan${failedScans === 1 ? "" : "s"} in the last ${WINDOW_HOURS}h`,
          href: "/admin/logs",
        }
      : null,
    blocked > 0
      ? { tone: "warn" as const, text: `${blocked} blocked ticket${blocked === 1 ? "" : "s"}`, href: "/admin/tickets" }
      : null,
    admins < 2
      ? {
          tone: "warn" as const,
          text: "Only one admin account exists — create a second so you cannot be locked out",
          href: "/admin/users",
        }
      : null,
  ].filter(Boolean) as { tone: "warn" | "info"; text: string; href: string }[];

  return (
    <>
      <PageHeader
        title="Admin overview"
        description="Everything across the college, and what needs attention."
        action={<ButtonLink href="/admin/users">Manage users</ButtonLink>}
      />

      <section aria-labelledby="kpis" className="mb-8">
        <h2 id="kpis" className="sr-only">
          Key numbers
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="py-4">
              <p className="text-eyebrow">{kpi.label}</p>
              <p className="mt-2 font-display text-3xl text-slate-900">{kpi.value}</p>
              <p className="mt-1 text-xs text-slate-500">{kpi.note}</p>
            </Card>
          ))}
        </div>
      </section>

      {alerts.length > 0 ? (
        <section aria-labelledby="alerts" className="mb-8">
          <h2 id="alerts" className="text-display mb-3 text-slate-900">
            Needs attention
          </h2>
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.text}>
                <Link
                  href={alert.href}
                  className={cx(
                    "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                    alert.tone === "warn"
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15"
                      : "border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/15",
                  )}
                >
                  {alert.text}
                  <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="activity">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="activity" className="text-display text-slate-900">
              Recent activity
            </h2>
            <ButtonLink href="/admin/logs" variant="secondary">
              All activity
            </ButtonLink>
          </div>
          <Card glow={false} className="p-0">
            {recentActivity.length === 0 ? (
              <p className="p-5 text-sm text-slate-600">Nothing logged yet.</p>
            ) : (
              <ul className="divide-y divide-white/6">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="row-hover px-4 py-3">
                    <p className="text-sm text-slate-800">{entry.action.replace(/_/g, " ").toLowerCase()}</p>
                    <p className="text-xs text-slate-500">
                      {entry.actor?.fullName ?? "system"} · {formatDateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section aria-labelledby="scans">
          <h2 id="scans" className="text-display mb-3 text-slate-900">
            Recent gate scans
          </h2>
          <Card glow={false} className="p-0">
            {recentScans.length === 0 ? (
              <p className="p-5 text-sm text-slate-600">No scans recorded yet.</p>
            ) : (
              <ul className="divide-y divide-white/6">
                {recentScans.map((scan) => (
                  <li key={scan.id} className="row-hover flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        {scan.event?.title ?? "Unknown event"}
                        {scan.gateId ? ` · ${scan.gateId}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {scan.reason ? scan.reason.replace(/_/g, " ").toLowerCase() : "entry allowed"} ·{" "}
                        {formatDateTime(scan.createdAt)}
                      </p>
                    </div>
                    <span
                      className={cx(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                        scan.result === "APPROVED"
                          ? "bg-emerald-400/12 text-emerald-300 ring-emerald-400/40"
                          : "bg-red-500/10 text-red-300 ring-red-400/30",
                      )}
                    >
                      {scan.result.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
