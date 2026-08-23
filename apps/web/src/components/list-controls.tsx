import Link from "next/link";
import { cx } from "./ui";

/**
 * Search and filter controls for lists that grow.
 *
 * Both are plain links and a GET form, no client JavaScript: the state lives in
 * the URL, so a filtered list can be bookmarked, shared with a co-organizer, or
 * reloaded at a gate without losing the view.
 *
 * Extracted from the attendee and event lists, which had each grown their own
 * copy. One implementation means a fix to keyboard behaviour or wrapping lands
 * everywhere at once.
 */

export type FilterOption = { label: string; value: string };

/**
 * Filter chips.
 *
 * `params` carries the other query values through, so choosing a status does
 * not silently discard the search someone already typed.
 */
export function FilterChips({
  label,
  basePath,
  param,
  current,
  options,
  params = {},
}: {
  label: string;
  basePath: string;
  param: string;
  current: string;
  options: readonly FilterOption[];
  params?: Record<string, string | undefined>;
}) {
  const href = (value: string) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, v);
    }
    if (value) search.set(param, value);
    else search.delete(param);
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav
      aria-label={label}
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible"
    >
      {options.map((option) => {
        const active = current === option.value;
        return (
          <Link
            key={option.label}
            href={href(option.value)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-all duration-200",
              active
                ? "border-brand-500/60 bg-brand-500/12 text-brand-300"
                : "border-white/12 text-slate-600 hover:border-white/25 hover:text-slate-800",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Search box.
 *
 * Any active filter rides along as a hidden input, so searching keeps the
 * filter rather than resetting the list.
 */
export function SearchBox({
  action,
  value,
  placeholder,
  hidden = {},
}: {
  action: string;
  value: string;
  placeholder: string;
  hidden?: Record<string, string | undefined>;
}) {
  const clearHref = () => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(hidden)) {
      if (v) search.set(k, v);
    }
    const qs = search.toString();
    return qs ? `${action}?${qs}` : action;
  };

  return (
    <form method="GET" action={action} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}

      <label htmlFor="q" className="sr-only">
        {placeholder}
      </label>
      <input
        id="q"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-white/20 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 sm:max-w-md"
      />
      <button
        type="submit"
        className="min-h-11 shrink-0 rounded-lg border border-white/12 bg-white/[0.03] px-4 text-sm font-medium text-slate-800 transition-all duration-200 hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-300"
      >
        Search
      </button>

      {value ? (
        <Link
          href={clearHref()}
          className="inline-flex min-h-11 items-center px-2 text-sm text-slate-600 hover:text-brand-400"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

/** "12 of 40 shown" — so a filtered list never looks like the whole list. */
export function ResultCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (shown === total) {
    return (
      <p className="text-sm text-slate-500">
        {total} {noun}
        {total === 1 ? "" : "s"}
      </p>
    );
  }
  return (
    <p className="text-sm text-slate-500">
      Showing {shown} of {total} {noun}
      {total === 1 ? "" : "s"}
    </p>
  );
}
