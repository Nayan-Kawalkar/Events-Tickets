import Link from "next/link";

const linkClass =
  "text-slate-600 transition-colors duration-200 hover:text-brand-300 link-underline";

/** Three-column footer on desktop, stacked on mobile. */
export function SiteFooter() {
  return (
    // Extra bottom padding clears the fixed mobile bottom bar.
    <footer className="mt-auto border-t border-white/6 pb-20 md:pb-0">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              About
            </h2>
            <p className="text-sm text-slate-600">
              CampusPass — digital tickets for college events.
            </p>
            <Link href="/help" className={`${linkClass} mt-2 inline-block text-sm`}>
              About this platform
            </Link>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Support
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/help" className={linkClass}>
                  Help Center
                </Link>
              </li>
              <li>
                <Link href="/help#contact" className={linkClass}>
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/help#terms" className={linkClass}>
                  Terms &amp; Privacy
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              College
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://example.edu"
                  className={linkClass}
                  target="_blank"
                  rel="noreferrer"
                >
                  College website
                </a>
              </li>
              <li>
                <a href="mailto:events@example.edu" className={linkClass}>
                  Event committee
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/6 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} College Name. Built by the Event Committee.</p>
          <p>
            <span className="text-brand-500">∿</span> Tickets are personal and single-use.
          </p>
        </div>
      </div>
    </footer>
  );
}
