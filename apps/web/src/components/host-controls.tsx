import { PenLine, QrCode, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { EventStatusActions } from "./event-status-actions";
import { EventStatusBadge, cx } from "./ui";
import { formatPrice } from "@/lib/format";
import type { EventStatus } from "@/lib/enums";

/**
 * Management panel shown on the event page to whoever hosts it.
 *
 * It lives here rather than on a separate dashboard because the host reaches
 * their event the same way everyone else does — from the events list — and
 * expects to act on it there.
 */
export function HostControls({
  eventId,
  status,
  registered,
  checkedIn,
  pendingPayments,
  revenuePaise,
}: {
  eventId: string;
  status: EventStatus;
  registered: number;
  checkedIn: number;
  pendingPayments: number;
  revenuePaise: number;
}) {
  const stats = [
    { label: "Registered", value: String(registered) },
    { label: "Checked in", value: String(checkedIn) },
    { label: "Awaiting payment", value: String(pendingPayments) },
    { label: "Revenue", value: formatPrice(revenuePaise) },
  ];

  const actions = [
    {
      href: `/organizer/events/${eventId}/edit`,
      label: "Edit details",
      hint: "Tickets, hosts, volunteers",
      Icon: PenLine,
    },
    {
      href: `/organizer/events/${eventId}/attendees`,
      label: "Guest list",
      hint: `${registered} registered`,
      Icon: Users,
    },
    {
      href: `/organizer/events/${eventId}/payments`,
      label: "Payments",
      hint: pendingPayments > 0 ? `${pendingPayments} to verify` : "All verified",
      Icon: Wallet,
      alert: pendingPayments > 0,
    },
    {
      // Pre-selects this event so a gate cannot be left on the wrong one.
      href: `/scanner?event=${eventId}`,
      label: "Scan tickets",
      hint: "Open the gate scanner",
      Icon: QrCode,
    },
  ];

  return (
    <section
      aria-labelledby="host-controls"
      className="animate-rise mb-8 rounded-2xl border border-brand-500/30 bg-brand-500/[0.06] p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-brand-300 ring-1 ring-inset ring-brand-500/40">
            You host this
          </span>
          <h2 id="host-controls" className="text-sm text-slate-600">
            Only you and admins see this panel
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EventStatusBadge status={status} />
          <EventStatusActions eventId={eventId} status={status} />
        </div>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {stat.label}
            </dt>
            <dd className="mt-1 font-display text-2xl text-slate-900">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <li key={action.href}>
            <Link
              href={action.href}
              className={cx(
                "flex min-h-14 items-center gap-3 rounded-lg border bg-[#09201e]/80 px-3 py-2.5 transition-colors hover:border-brand-500/60 hover:bg-brand-500/10",
                action.alert ? "border-amber-400/40" : "border-white/10",
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300"
              >
                <action.Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900">{action.label}</span>
                <span
                  className={cx("block text-xs", action.alert ? "text-amber-300" : "text-slate-500")}
                >
                  {action.hint}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
