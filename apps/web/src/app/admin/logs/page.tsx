import type { Metadata } from "next";
import { prisma, Role } from "@ct/db";
import { Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Activity · Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

/** Actions worth colouring: security-relevant or destructive. */
const NOTABLE = new Set([
  "USER_LOGIN_FAILED",
  "ADMIN_USER_ROLE_CHANGED",
  "ADMIN_USER_DELETED",
  "ADMIN_USER_PASSWORD_RESET",
  "ADMIN_EVENT_DELETED",
  "ADMIN_TICKET_BLOCKED",
  "ADMIN_TICKET_CANCELLED",
  "ADMIN_TICKET_REISSUED",
  "MANUAL_PAYMENT_REJECTED",
  "ATTENDEES_EXPORTED",
]);

type Props = { searchParams: Promise<{ tab?: string; page?: string }> };

export default async function AdminLogsPage({ searchParams }: Props) {
  const [, sp] = await Promise.all([requireRole([Role.ADMIN]), searchParams]);

  const tab = sp.tab === "scans" ? "scans" : "audit";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [auditLogs, auditTotal, scans, scanTotal] = await Promise.all([
    tab === "audit"
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            metadata: true,
            ip: true,
            createdAt: true,
            actor: { select: { fullName: true, email: true } },
          },
        })
      : Promise.resolve([]),
    prisma.auditLog.count(),
    tab === "scans"
      ? prisma.checkinAttempt.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            id: true,
            result: true,
            reason: true,
            gateId: true,
            createdAt: true,
            event: { select: { title: true } },
            scanner: { select: { fullName: true } },
          },
        })
      : Promise.resolve([]),
    prisma.checkinAttempt.count(),
  ]);

  const total = tab === "audit" ? auditTotal : scanTotal;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every administrative action and every gate scan, oldest kept indefinitely."
      />

      <nav aria-label="Log type" className="mb-5 flex gap-2">
        {[
          { key: "audit", label: `Audit log (${auditTotal})` },
          { key: "scans", label: `Gate scans (${scanTotal})` },
        ].map((item) => (
          <a
            key={item.key}
            href={`/admin/logs?tab=${item.key}`}
            aria-current={tab === item.key ? "page" : undefined}
            className={
              tab === item.key
                ? "rounded-full border border-brand-500 bg-brand-500 px-3.5 py-1.5 text-sm font-medium text-[#04231c]"
                : "rounded-full border border-white/12 bg-white/[0.03] px-3.5 py-1.5 text-sm text-slate-700 transition-colors hover:border-brand-500/50 hover:text-brand-300"
            }
          >
            {item.label}
          </a>
        ))}
      </nav>

      {total === 0 ? (
        <EmptyState title="Nothing logged yet" />
      ) : (
        <Card glow={false} className="p-0">
          <ul className="divide-y divide-white/6">
            {tab === "audit"
              ? auditLogs.map((entry) => (
                  <li key={entry.id} className="row-hover px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p
                        className={cx(
                          "text-sm font-medium",
                          NOTABLE.has(entry.action) ? "text-amber-300" : "text-slate-800",
                        )}
                      >
                        {entry.action.replace(/_/g, " ").toLowerCase()}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.actor ? `${entry.actor.fullName} (${entry.actor.email})` : "system"} ·{" "}
                      {entry.entityType}
                      {entry.ip ? ` · ${entry.ip}` : ""}
                    </p>
                    {entry.metadata && Object.keys(entry.metadata as object).length > 0 ? (
                      <pre className="text-code mt-1.5 overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-slate-600">
                        {JSON.stringify(entry.metadata, null, 0)}
                      </pre>
                    ) : null}
                  </li>
                ))
              : scans.map((scan) => (
                  <li key={scan.id} className="row-hover flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        {scan.event?.title ?? "Unknown event"}
                        {scan.gateId ? ` · ${scan.gateId}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {scan.scanner?.fullName ?? "unknown scanner"} ·{" "}
                        {scan.reason ? scan.reason.replace(/_/g, " ").toLowerCase() : "entry allowed"}{" "}
                        · {formatDateTime(scan.createdAt)}
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
        </Card>
      )}

      {pages > 1 ? (
        <div className="mt-5 flex items-center justify-between text-sm">
          <a
            href={`/admin/logs?tab=${tab}&page=${page - 1}`}
            aria-disabled={page <= 1}
            className={cx(
              "rounded-lg border border-white/12 px-4 py-2",
              page <= 1 ? "pointer-events-none opacity-40" : "hover:border-brand-500/60 hover:text-brand-300",
            )}
          >
            ← Newer
          </a>
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <a
            href={`/admin/logs?tab=${tab}&page=${page + 1}`}
            aria-disabled={page >= pages}
            className={cx(
              "rounded-lg border border-white/12 px-4 py-2",
              page >= pages ? "pointer-events-none opacity-40" : "hover:border-brand-500/60 hover:text-brand-300",
            )}
          >
            Older →
          </a>
        </div>
      ) : null}
    </>
  );
}
