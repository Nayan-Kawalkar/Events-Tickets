/**
 * Loading placeholders.
 *
 * These render instantly from the server while the real page waits on the
 * database, so a click produces visible movement immediately instead of a dead
 * pause on the previous screen.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

export function SkeletonHeader() {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="w-full">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-11 w-32 shrink-0" />
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#09201e]/90 p-5">
      <Skeleton className="h-5 w-1/2" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`mt-3 h-3.5 ${i === lines - 1 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}

/** Whole-page fallback: header plus a list of cards. */
export function PageSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="animate-rise">
      <SkeletonHeader />
      <SkeletonList count={count} />
      <span className="sr-only" role="status">
        Loading…
      </span>
    </div>
  );
}
