"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import {
  ACCOUNT_NAV,
  ORGANIZER_NAV,
  PRIMARY_NAV,
  excluding,
  isActive,
  titleForPath,
  visibleTo,
  type IconName,
} from "@/lib/nav";
import type { Role } from "@/lib/enums";
import { NavIcon } from "./nav-icon";
import { cx } from "./ui";

type NavUser = { fullName: string; email: string; role: Role } | null;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Centre navigation, desktop only. Active page is bold with an underline. */
export function PrimaryNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const items = visibleTo(PRIMARY_NAV, user?.role ?? null);

  return (
    <nav aria-label="Primary" className="hidden md:flex md:items-center md:gap-5 lg:gap-7">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative py-1 text-sm transition-colors duration-200",
              active
                ? "font-semibold text-slate-900"
                : "text-slate-600 hover:text-brand-300",
            )}
          >
            {item.label}
            <span
              aria-hidden="true"
              className={cx(
                "absolute -bottom-0.5 left-0 h-0.5 w-full rounded-full bg-brand-500 transition-transform duration-300",
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** Avatar with a dropdown: Profile, Settings, Logout. Desktop only. */
export function UserMenu({ user }: { user: NonNullable<NavUser> }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change, outside click, or Escape.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Organizer tools belong in the dropdown too: the top bar has room for three
  // primary links, and the scanner is otherwise unreachable on desktop.
  const organizerItems = excluding(
    visibleTo(ORGANIZER_NAV, user.role),
    visibleTo(PRIMARY_NAV, user.role),
  );
  const items = visibleTo(ACCOUNT_NAV, user.role);

  return (
    <div ref={wrapRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-brand-500/15 text-sm font-semibold text-brand-300 transition-all duration-200 hover:border-brand-500/60 hover:bg-brand-500/25"
      >
        <span aria-hidden="true">{initials(user.fullName)}</span>
        <span className="sr-only">Account menu for {user.fullName}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-rise absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#0b2a27] shadow-2xl shadow-black/60"
        >
          <div className="border-b border-white/8 px-4 py-3">
            <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-brand-400">
              {user.role.toLowerCase()}
            </p>
          </div>

          {organizerItems.length > 0 ? (
            <div className="border-b border-white/8 py-1">
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Organizer
              </p>
              {organizerItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-brand-500/10 hover:text-brand-300"
                >
                  <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="py-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-brand-500/10 hover:text-brand-300"
              >
                <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>

          <form action="/api/auth/logout" method="post" className="border-t border-white/8">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              Logout
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Mobile: page title in the header centre, so people know where they are. */
export function MobilePageTitle() {
  const pathname = usePathname();
  return (
    <span className="truncate text-sm font-medium text-slate-800 md:hidden">
      {titleForPath(pathname)}
    </span>
  );
}

/** Mobile: fixed bottom bar. Icons always carry a text label. */
export function BottomNav({ user }: { user: NavUser }) {
  const pathname = usePathname();

  // Every destination lives here now that the drawer is gone. Annotated before
  // filtering so `icon` keeps its IconName type.
  const ALL: {
    href: string;
    label: string;
    icon: IconName;
    authOnly?: boolean;
    organizerOnly?: boolean;
    scannerOnly?: boolean;
    guestOnly?: boolean;
  }[] = [
    { href: "/", label: "Events", icon: "home" },
    { href: "/tickets", label: "Tickets", icon: "ticket", authOnly: true },
    { href: "/organizer/events", label: "Manage", icon: "calendar", organizerOnly: true },
    { href: "/scanner", label: "Scan", icon: "scan", scannerOnly: true },
    { href: "/profile", label: "Profile", icon: "user", authOnly: true },
    { href: "/help", label: "Help", icon: "help", guestOnly: true },
  ];

  // Five is the most that stays tappable on a 360px screen.
  const items = ALL.filter((item) => {
    if (item.organizerOnly) return user?.role === "ORGANIZER" || user?.role === "ADMIN";
    if (item.scannerOnly) {
      return user?.role === "SCANNER" || user?.role === "ORGANIZER" || user?.role === "ADMIN";
    }
    if (item.authOnly) return Boolean(user);
    if (item.guestOnly) return !user;
    return true;
  }).slice(0, 5);

  // Hide on the scanner: that screen needs the full viewport at a gate.
  if (pathname.startsWith("/scanner")) return null;

  return (
    <nav
      aria-label="Bottom"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-[#041413]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] transition-colors",
                  active ? "text-brand-400" : "text-slate-600 hover:text-slate-800",
                )}
              >
                <NavIcon
                  name={item.icon}
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span className={active ? "font-semibold" : undefined}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
