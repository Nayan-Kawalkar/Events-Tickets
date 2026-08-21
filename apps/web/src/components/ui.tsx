import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { EventStatus, TicketStatus } from "@/lib/enums";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const buttonStyles = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
} as const;

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

/**
 * Status pills pair colour with a text label and a shape marker, so they stay
 * readable for colour-blind users and in monochrome print.
 */
const eventStatusStyles: Record<EventStatus, string> = {
  [EventStatus.DRAFT]: "bg-slate-100 text-slate-700 ring-slate-300",
  [EventStatus.PUBLISHED]: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  [EventStatus.CLOSED]: "bg-amber-50 text-amber-800 ring-amber-300",
  [EventStatus.CANCELLED]: "bg-red-50 text-red-800 ring-red-300",
  [EventStatus.COMPLETED]: "bg-sky-50 text-sky-800 ring-sky-300",
};

const ticketStatusStyles: Record<TicketStatus, string> = {
  [TicketStatus.ISSUED]: "bg-emerald-50 text-emerald-800 ring-emerald-300",
  [TicketStatus.CHECKED_IN]: "bg-sky-50 text-sky-800 ring-sky-300",
  [TicketStatus.CANCELLED]: "bg-slate-100 text-slate-700 ring-slate-300",
  [TicketStatus.BLOCKED]: "bg-red-50 text-red-800 ring-red-300",
  [TicketStatus.EXPIRED]: "bg-amber-50 text-amber-800 ring-amber-300",
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset";

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <span className={cx(pillBase, eventStatusStyles[status])}>{status.toLowerCase()}</span>;
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cx(pillBase, ticketStatusStyles[status])}>
      {status.replace("_", " ").toLowerCase()}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-300 bg-red-50 text-red-800",
    success: "border-emerald-300 bg-emerald-50 text-emerald-800",
    info: "border-sky-300 bg-sky-50 text-sky-800",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
