import Link from "next/link";
import { ArrowRight, BellRing, CircleAlert, CircleCheck, Info } from "lucide-react";
import type { Update, UpdateTone } from "@/lib/updates";
import { cx } from "./ui";

/**
 * What changed since you were last here, each row a direct route to the thing
 * itself — a verified payment goes to the ticket's QR, not to a list.
 *
 * Renders nothing when there is nothing to say. An empty "no updates" box on
 * every visit is noise, and the home page's job is the events below it.
 */

const TONE: Record<UpdateTone, { icon: typeof Info; ring: string; text: string }> = {
  success: { icon: CircleCheck, ring: "bg-brand-500/12 ring-brand-500/40", text: "text-brand-300" },
  warning: { icon: CircleAlert, ring: "bg-amber-400/10 ring-amber-400/30", text: "text-amber-300" },
  info: { icon: Info, ring: "bg-sky-400/10 ring-sky-400/30", text: "text-sky-300" },
};

export function UpdatesPanel({ updates }: { updates: Update[] }) {
  if (updates.length === 0) return null;

  return (
    <section aria-labelledby="updates" className="animate-rise">
      <h2 id="updates" className="text-eyebrow mb-3 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-brand-400" strokeWidth={1.75} aria-hidden="true" />
        Updates for you
      </h2>

      <ul className="divide-y divide-white/6 overflow-hidden rounded-xl border border-white/8 bg-[#09201e]/90">
        {updates.map((update) => {
          const tone = TONE[update.tone];
          const Icon = tone.icon;

          return (
            <li key={update.id}>
              {/* The whole row is the link: on a phone a small "view" target is
                  the difference between tapping it and giving up. */}
              <Link
                href={update.href}
                className="row-hover flex items-center gap-3 px-4 py-3 transition-colors"
              >
                <span
                  aria-hidden="true"
                  className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1", tone.ring)}
                >
                  <Icon className={cx("h-4 w-4", tone.text)} strokeWidth={1.75} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {update.title}
                  </span>
                  {update.detail ? (
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{update.detail}</span>
                  ) : null}
                </span>

                <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-brand-300 sm:flex">
                  {update.action}
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-brand-300 sm:hidden"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
