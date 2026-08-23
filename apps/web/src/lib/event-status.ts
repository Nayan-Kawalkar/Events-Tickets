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
 * One `UPDATE ... WHERE` that usually matches nothing, so it is cheap to call
 * from a page render. Never throws: a failed sync must not break a page, since
 * the derived status already shows the right thing.
 */
export async function syncCompletedEvents() {
  try {
    const result = await prisma.event.updateMany({
      where: { status: { in: [...AGEABLE] }, endsAt: { lt: new Date() } },
      data: { status: EventStatus.COMPLETED },
    });
    return result.count;
  } catch (err) {
    console.error("[events] failed to sync completed events", err);
    return 0;
  }
}

/** Statuses a visitor may see listed publicly. */
export const PUBLIC_STATUSES = [
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
  EventStatus.COMPLETED,
] as const;
