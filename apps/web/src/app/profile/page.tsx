import Link from "next/link";
import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { Role } from "@ct/db";
import { NavIcon } from "@/components/nav-icon";
import { ProfileForm } from "@/components/profile-form";
import { Card, PageHeader, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { IconName } from "@/lib/nav";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

type LinkRow = { href: string; label: string; hint: string; icon: IconName };

export default async function ProfilePage() {
  const user = await requireUser("/profile");
  const isStaff = user.role === Role.ORGANIZER || user.role === Role.ADMIN;
  const isVolunteer = user.role === Role.SCANNER;

  const account: LinkRow[] = [
    { href: "/tickets", label: "My tickets", hint: "Your QR codes", icon: "ticket" },
    { href: "/payments", label: "Payments", hint: "UPI payments and their status", icon: "rupee" },
    { href: "/settings", label: "Settings", hint: "Account preferences", icon: "settings" },
    { href: "/help", label: "Help", hint: "Common questions and contact", icon: "help" },
  ];

  const volunteer: LinkRow[] = isVolunteer
    ? [{ href: "/scanner", label: "Gate scanner", hint: "Check attendees in", icon: "scan" }]
    : [];

  const staff: LinkRow[] = isStaff
    ? [
        { href: "/organizer", label: "Organizer dashboard", hint: "Your events at a glance", icon: "dashboard" },
        { href: "/organizer/events", label: "Manage events", hint: "Create and edit events", icon: "calendar" },
        { href: "/scanner", label: "Gate scanner", hint: "Check attendees in", icon: "scan" },
      ]
    : [];

  const adminLinks: LinkRow[] =
    user.role === Role.ADMIN
      ? [{ href: "/admin", label: "Admin", hint: "Users, events, tickets, activity", icon: "shield" }]
      : [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your profile" description={user.email} />

      <div className="space-y-8">
        <Card glow={false} className="flex items-center gap-4 p-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-lg font-semibold text-brand-300"
          >
            {user.fullName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? "")
              .join("")}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{user.fullName}</p>
            <p className="truncate text-sm text-slate-600">{user.email}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-brand-400">
              {user.role.toLowerCase()}
            </p>
          </div>
        </Card>

        <LinkGroup title="Account" rows={account} />
        {volunteer.length > 0 ? <LinkGroup title="Volunteer" rows={volunteer} /> : null}
        {staff.length > 0 ? <LinkGroup title="Organizer" rows={staff} /> : null}
        {adminLinks.length > 0 ? <LinkGroup title="Administration" rows={adminLinks} /> : null}

        <section aria-labelledby="details">
          <h2 id="details" className="text-display mb-3 text-slate-900">
            Your details
          </h2>
          <ProfileForm
            initial={{
              email: user.email,
              fullName: user.fullName,
              rollNumber: user.rollNumber ?? "",
              department: user.department ?? "",
            }}
          />
        </section>

        {/* Sign-out lives here now that the mobile menu is gone. A plain form
            post, so it works without JavaScript. */}
        <section aria-labelledby="signout">
          <h2 id="signout" className="sr-only">
            Sign out
          </h2>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 text-sm font-medium text-red-300 transition-colors hover:border-red-400/60 hover:bg-red-500/20"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Log out
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function LinkGroup({ title, rows }: { title: string; rows: LinkRow[] }) {
  return (
    <section aria-labelledby={`group-${title}`}>
      <h2 id={`group-${title}`} className="text-eyebrow mb-2">
        {title}
      </h2>
      <ul className="divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8 bg-[#09201e]/90">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className={cx(
                "row-hover flex min-h-14 items-center gap-3 px-4 py-3 transition-colors",
                "hover:text-brand-300",
              )}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-slate-600"
              >
                <NavIcon name={row.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{row.label}</span>
                <span className="block text-xs text-slate-500">{row.hint}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-slate-500">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
