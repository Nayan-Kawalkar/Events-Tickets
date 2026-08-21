import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { EventStatus, TicketStatus } from "@/lib/enums";
import { PendingLink } from "./pending-link";
import { SpotlightCard } from "./spotlight-card";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const surface = "rounded-xl border border-white/8 bg-[#09201e]/90 backdrop-blur-sm";

/** Card surface. Interactive cards get the cursor-tracking glow. */
export function Card({
  children,
  className,
  glow = true,
}: {
  children: ReactNode;
  className?: string;
  /** Turn off for dense/static panels where the sweep would be noise. */
  glow?: boolean;
}) {
  if (!glow) {
    return <div className={cx(surface, "p-5 shadow-lg shadow-black/40", className)}>{children}</div>;
  }

  return (
    <SpotlightCard className={cx(surface, "p-5 shadow-lg shadow-black/40", className)}>
      {children}
    </SpotlightCard>
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
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-rise">
        <h1 className="font-display text-3xl font-normal text-slate-900 sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const buttonStyles = {
  primary:
    "bg-brand-500 text-[#04231c] font-semibold shadow-[0_0_0_0_rgba(43,220,163,0)] hover:bg-brand-400 hover:shadow-[0_8px_24px_-6px_rgba(43,220,163,0.55)] active:translate-y-px",
  secondary:
    "border border-white/12 bg-white/[0.03] text-slate-800 hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-300 active:translate-y-px",
  danger:
    "border border-red-400/30 bg-red-500/10 text-red-300 hover:border-red-400/60 hover:bg-red-500/20 active:translate-y-px",
  ghost: "text-slate-700 hover:text-brand-400",
} as const;

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

/** Button-shaped link. Shows a spinner while the next page is being fetched. */
export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <PendingLink className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

/**
 * Status pills. Each pairs a colour with a written label, so the state survives
 * greyscale printing and colour-blindness — colour is never the only signal.
 */
const eventStatusStyles: Record<EventStatus, string> = {
  [EventStatus.DRAFT]: "bg-slate-200/50 text-slate-700 ring-white/10",
  [EventStatus.PUBLISHED]: "bg-brand-500/12 text-brand-300 ring-brand-500/40",
  [EventStatus.CLOSED]: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  [EventStatus.CANCELLED]: "bg-red-500/10 text-red-300 ring-red-400/30",
  [EventStatus.COMPLETED]: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
};

const ticketStatusStyles: Record<TicketStatus, string> = {
  [TicketStatus.ISSUED]: "bg-sky-400/12 text-sky-300 ring-sky-400/40",
  [TicketStatus.CHECKED_IN]: "bg-emerald-400/12 text-emerald-300 ring-emerald-400/40",
  [TicketStatus.CANCELLED]: "bg-slate-200/50 text-slate-700 ring-white/10",
  [TicketStatus.BLOCKED]: "bg-red-500/10 text-red-300 ring-red-400/30",
  [TicketStatus.EXPIRED]: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
};

const pillBase =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide ring-1 ring-inset";

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

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
      <p className="font-display text-lg text-slate-900">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const tones = {
    error: "border-red-400/30 bg-red-500/10 text-red-200",
    success: "border-brand-500/40 bg-brand-500/10 text-brand-200",
    info: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  } as const;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-lg border px-4 py-3 text-sm backdrop-blur-sm", tones[tone])}
    >
      {children}
    </div>
  );
}
