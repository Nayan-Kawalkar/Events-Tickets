import type { Metadata } from "next";
import { prisma, Role, SuperPassStatus } from "@ct/db";
import { TicketQr } from "@/components/ticket-qr";
import {
  ExpiryCountdown,
  IssueSuperPass,
  RevokeSuperPass,
} from "@/components/super-pass-actions";
import { Alert, Card, EmptyState, PageHeader, cx } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { buildSuperPassPayload } from "@/lib/super-pass";

export const metadata: Metadata = { title: "Master pass · Admin" };
export const dynamic = "force-dynamic";

const statusStyles: Record<SuperPassStatus, string> = {
  ACTIVE: "bg-brand-500/12 text-brand-300 ring-brand-500/40",
  USED: "bg-sky-400/12 text-sky-300 ring-sky-400/40",
  REVOKED: "bg-slate-200/50 text-slate-700 ring-white/10",
  EXPIRED: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
};

export default async function SuperPassPage() {
  await requireRole([Role.ADMIN], "/admin/super-pass");

  const now = new Date();

  const [active, history] = await Promise.all([
    prisma.superPass.findFirst({
      where: { status: SuperPassStatus.ACTIVE, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, label: true, expiresAt: true, createdAt: true },
    }),
    prisma.superPass.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        label: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        usedAt: true,
        usedGateId: true,
        usedBy: { select: { fullName: true } },
        usedEvent: { select: { title: true } },
        createdBy: { select: { fullName: true } },
      },
    }),
  ]);

  const payload = active ? buildSuperPassPayload(active) : null;

  return (
    <>
      <PageHeader
        title="Master pass"
        description="A single-use QR that opens any gate, for guests without a ticket."
      />

      <div className="mb-6">
        <Alert tone="error">
          <strong>This bypasses ticketing.</strong> It admits one person at any event, once, and
          then must be replaced. Show it only to the person entering, and revoke it if a screenshot
          may have spread. Every issue and use is logged below.
        </Alert>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="current">
          <h2 id="current" className="text-display mb-3 text-slate-900">
            Current pass
          </h2>

          {active && payload ? (
            <Card className="space-y-4">
              <TicketQr payload={payload} />

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-600">Label</dt>
                  <dd className="text-slate-900">{active.label ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-600">Expires</dt>
                  <dd className="font-medium">
                    <ExpiryCountdown expiresAt={active.expiresAt.toISOString()} />
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-600">Issued</dt>
                  <dd className="text-slate-900">{formatDateTime(active.createdAt)}</dd>
                </div>
              </dl>

              <div className="border-t border-white/8 pt-3">
                <RevokeSuperPass />
              </div>
            </Card>
          ) : (
            <EmptyState
              title="No active master pass"
              description="Generate one when a guest needs to enter without a ticket. It lasts one scan."
            />
          )}
        </section>

        <section aria-labelledby="issue">
          <h2 id="issue" className="text-display mb-3 text-slate-900">
            Generate
          </h2>
          <Card className="space-y-4">
            <IssueSuperPass hasActive={Boolean(active)} />
            <p className="text-xs text-slate-500">
              Issuing a new pass revokes the current one, so only one master key is ever live. A
              pass also expires on its own timer even if nobody scans it.
            </p>
          </Card>
        </section>
      </div>

      <section aria-labelledby="history" className="mt-10">
        <h2 id="history" className="text-display mb-3 text-slate-900">
          History
        </h2>

        {history.length === 0 ? (
          <Card glow={false}>
            <p className="text-sm text-slate-600">No master pass has been issued yet.</p>
          </Card>
        ) : (
          <Card glow={false} className="p-0">
            <ul className="divide-y divide-white/6">
              {history.map((pass) => (
                <li key={pass.id} className="row-hover flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{pass.label ?? "Master pass"}</p>
                    <p className="text-xs text-slate-500">
                      issued {formatDateTime(pass.createdAt)} by {pass.createdBy.fullName}
                      {pass.usedAt
                        ? ` · used ${formatDateTime(pass.usedAt)} at ${pass.usedEvent?.title ?? "an event"}${
                            pass.usedGateId ? ` (${pass.usedGateId})` : ""
                          } by ${pass.usedBy?.fullName ?? "a scanner"}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={cx(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      statusStyles[pass.status],
                    )}
                  >
                    {pass.status.toLowerCase()}
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
