import "server-only";
import { prisma, EventStatus } from "@ct/db";

/**
 * Event lifecycle driven by the clock.
 *
 * There is no scheduler, so status is derived from `endsAt` at read time and
 * written back opportunistically. Deriving is what makes it correct the instant
 * an event ends; the write-back keeps the stored column honest for anything
 * that filters on it directly (admin lists, exports, reports).
 *
 * Only a live event ages into COMPLETED. A DRAFT never ran, and a CANCELLED one
 * was called off — neither becomes "completed" just because time passed.
 */
const AGEABLE = [EventStatus.PUBLISHED, EventStatus.CLOSED] as const;

export function effectiveStatus(event: { status: EventStatus; endsAt: Date }): EventStatus {
  const ageable = (AGEABLE as readonly EventStatus[]).includes(event.status);
  if (ageable && event.endsAt.getTime() < Date.now()) return EventStatus.COMPLETED;
  return event.status;
}

export function isPastEvent(event: { status: EventStatus; endsAt: Date }) {
  return effectiveStatus(event) === EventStatus.COMPLETED || event.endsAt.getTime() < Date.now();
}

/**
 * Move finished events to COMPLETED.
 *
 * One `UPDATE ... WHERE` that usually matches nothing — cheap in database work,
 * but still a network round-trip, and it sits on the render path of every
 * listing page. Throttled to once per interval per process so it costs nothing
 * on the requests in between.
 *
 * Delaying the write-back is safe because it is only ever a write-back:
 * `effectiveStatus` already derives the right answer at read time, so nothing a
 * user sees waits on this.
 *
 * Never throws: a failed sync must not break a page.
 */
const SYNC_INTERVAL_MS = 60_000;
let lastSyncAt = 0;
let inFlight: Promise<number> | null = null;

export async function syncCompletedEvents(force = false) {
  const due = force || Date.now() - lastSyncAt >= SYNC_INTERVAL_MS;
  if (!due) return 0;

  // Concurrent renders share one round-trip rather than each issuing their own.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const result = await prisma.event.updateMany({
        where: { status: { in: [...AGEABLE] }, endsAt: { lt: new Date() } },
        data: { status: EventStatus.COMPLETED },
      });
      // Stamped only on success, so a failed attempt is retried immediately
      // rather than being suppressed for a full interval.
      lastSyncAt = Date.now();
      return result.count;
    } catch (err) {
      console.error("[events] failed to sync completed events", err);
      return 0;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Events a gate may still work, as a Prisma `where` fragment.
 *
 * Wider than "published": an event that has just aged into COMPLETED still
 * admits people for as long as its QR codes stay valid, so it must remain
 * selectable in the scanner. Without this the event would vanish from the gate
 * at exactly the moment a queue is still moving.
 */
export function gateWindowWhere() {
  const graceMs = Number(process.env.QR_TTL_SECONDS ?? 21600) * 1000;
  return {
    status: { in: [EventStatus.PUBLISHED, EventStatus.CLOSED, EventStatus.COMPLETED] },
    endsAt: { gte: new Date(Date.now() - graceMs) },
  };
}

/** Statuses a visitor may see listed publicly. */
export const PUBLIC_STATUSES = [
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
  EventStatus.COMPLETED,
] as const;
