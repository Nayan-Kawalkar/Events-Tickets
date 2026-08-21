import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { MobileDrawer, MobilePageTitle, PrimaryNav, UserMenu } from "./site-nav";

/**
 * Sticky header.
 *
 * Desktop: logo left, primary navigation centred, account menu right.
 * Mobile:  logo left, current page title centred, hamburger right.
 */
export function SiteHeader({ user }: { user: SessionUser | null }) {
  const navUser = user
    ? { fullName: user.fullName, email: user.email, role: user.role }
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-[#041413]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-slate-900"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-black text-[#04231c] transition-transform duration-200 group-hover:scale-105"
          >
            CP
          </span>
          <span className="hidden sm:inline">
            Campus<span className="text-brand-500">Pass</span>
          </span>
        </Link>

        {/* Centre: nav on desktop, page title on mobile. */}
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          <PrimaryNav user={navUser} />
          <MobilePageTitle />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <UserMenu user={{ fullName: user.fullName, email: user.email, role: user.role }} />
          ) : (
            <div className="hidden items-center gap-3 md:flex">
              <Link
                href="/login"
                className="text-sm text-slate-600 transition-colors hover:text-brand-300"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-[#04231c] transition-all duration-200 hover:bg-brand-400 hover:shadow-[0_8px_24px_-6px_rgba(43,220,163,0.55)]"
              >
                Create account
              </Link>
            </div>
          )}
          <MobileDrawer user={navUser} />
        </div>
      </div>
    </header>
  );
}
