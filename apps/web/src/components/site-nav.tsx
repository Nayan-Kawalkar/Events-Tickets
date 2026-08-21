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

/** Mobile: hamburger opening a slide-over drawer from the right. */
export function MobileDrawer({ user }: { user: NavUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind the drawer from scrolling.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const primary = visibleTo(PRIMARY_NAV, user?.role ?? null);
  const organizer = excluding(
    visibleTo(ORGANIZER_NAV, user?.role ?? null),
    primary,
  );
  const account = visibleTo(ACCOUNT_NAV, user?.role ?? null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-drawer"
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/12 text-slate-800 transition-colors hover:border-brand-500/60 hover:text-brand-300 md:hidden"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">Open menu</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            id="mobile-drawer"
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 right-0 flex w-[86%] max-w-xs flex-col border-l border-white/10 bg-[#09201e] shadow-2xl"
            style={{ animation: "slideIn 0.25s cubic-bezier(0.22,1,0.36,1) both" }}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              {user ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-900">Menu</p>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:text-brand-300"
              >
                <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">Close menu</span>
              </button>
            </div>

            <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-2 py-3">
              <DrawerGroup items={primary} pathname={pathname} />
              {organizer.length > 0 ? (
                <DrawerGroup label="Organizer" items={organizer} pathname={pathname} />
              ) : null}
              <DrawerGroup label="Account" items={account} pathname={pathname} />
            </nav>

            <div className="border-t border-white/8 p-3">
              {user ? (
                <form action="/api/auth/logout" method="post">
                  <button
                    type="submit"
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
                  >
                    <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Logout
                  </button>
                </form>
              ) : (
                <Link
                  href="/login"
                  className="flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-[#04231c]"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DrawerGroup({
  label,
  items,
  pathname,
}: {
  label?: string;
  items: { href: string; label: string; icon: IconName }[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-2">
      {label ? (
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
      ) : null}
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              active
                ? "bg-brand-500/12 font-semibold text-brand-300"
                : "text-slate-700 hover:bg-white/5 hover:text-slate-900",
            )}
          >
            <NavIcon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Mobile: fixed bottom bar. Icons always carry a text label. */
export function BottomNav({ user }: { user: NavUser }) {
  const pathname = usePathname();

  // Annotated before filtering, so `icon` keeps its IconName type.
  const ALL: {
    href: string;
    label: string;
    icon: IconName;
    authOnly?: boolean;
    organizerOnly?: boolean;
  }[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/tickets", label: "Tickets", icon: "ticket", authOnly: true },
    { href: "/organizer/events/new", label: "Create", icon: "plus", organizerOnly: true },
    { href: "/profile", label: "Profile", icon: "user", authOnly: true },
    { href: "/help", label: "More", icon: "menu" },
  ];

  const items = ALL.filter((item) => {
    if (item.organizerOnly) return user?.role === "ORGANIZER" || user?.role === "ADMIN";
    if (item.authOnly) return Boolean(user);
    return true;
  });

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
