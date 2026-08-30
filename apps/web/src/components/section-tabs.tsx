"use client";

import { useState } from "react";
import { cx } from "./ui";

export type Section = {
  value: string;
  label: string;
  /** Shown beside the label; omit where a count means nothing. */
  count?: number;
  content: React.ReactNode;
};

/**
 * Switch between sections that are already on the page.
 *
 * Deliberately not links. As links, each tab was a full navigation to a dynamic
 * route: the browser sat on the old page — URL unchanged, nothing moving — for
 * as long as the server took, which reads as a dead click. Every section here
 * is rendered by the server in the same response, so switching is a local state
 * change and lands immediately.
 *
 * The URL is still kept in step with `replaceState`, so the address bar matches
 * what is on screen and the section can be shared or reloaded — but without the
 * round trip a real navigation would cost.
 */
export function SectionTabs({
  sections,
  initial,
  label,
  param = "tab",
}: {
  sections: Section[];
  initial: string;
  label: string;
  param?: string;
}) {
  const [active, setActive] = useState(
    sections.some((s) => s.value === initial) ? initial : (sections[0]?.value ?? ""),
  );

  function select(value: string) {
    setActive(value);

    // History only — a router push would re-fetch the page we already have.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(param, value);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // A failed URL update must never stop the section from switching.
    }
  }

  const current = sections.find((s) => s.value === active) ?? sections[0];

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible"
      >
        {sections.map((section) => {
          const selected = section.value === active;
          return (
            <button
              key={section.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => select(section.value)}
              className={cx(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
                selected
                  ? "border-brand-500/60 bg-brand-500/12 text-brand-300"
                  : "border-white/12 text-slate-600 hover:border-white/25 hover:text-slate-800",
              )}
            >
              {section.label}
              {section.count === undefined ? null : (
                <span className={cx("ml-1.5", selected ? "text-brand-400/80" : "text-slate-500")}>
                  {section.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{current?.content}</div>
    </>
  );
}
