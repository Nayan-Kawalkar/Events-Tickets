import Link from "next/link";
import { Role } from "@ct/db";
import type { SessionUser } from "@/lib/auth";

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const isOrganizer = user?.role === Role.ORGANIZER || user?.role === Role.ADMIN;

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3"
      >
        <Link href="/" className="text-base font-semibold tracking-tight text-slate-900">
          College Events
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {user ? (
            <>
              <Link href="/dashboard" className="text-slate-700 hover:text-brand-700">
                Dashboard
              </Link>
              <Link href="/student/tickets" className="text-slate-700 hover:text-brand-700">
                My tickets
              </Link>
              <Link href="/student/payments" className="text-slate-700 hover:text-brand-700">
                Payments
              </Link>
              {isOrganizer ? (
                <>
                  <Link href="/organizer/events" className="text-slate-700 hover:text-brand-700">
                    Manage events
                  </Link>
                  <Link href="/scanner" className="text-slate-700 hover:text-brand-700">
                    Scanner
                  </Link>
                </>
              ) : null}
              <span className="hidden text-slate-500 sm:inline">
                {user.fullName} · {user.role.toLowerCase()}
              </span>
              {/* Plain form post so sign-out works without JavaScript. */}
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="text-slate-700 underline-offset-2 hover:text-brand-700 hover:underline">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-slate-700 hover:text-brand-700">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
