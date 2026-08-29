import "server-only";
import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma, EventStatus } from "@ct/db";
import { LIVE_TICKET_STATUS_LIST } from "./ticket-status";

/**
 * Caching for the *public* event catalogue only.
 *
 * The rule that decides what may live in here: a query is cacheable when its
 * result is identical for every visitor. Anything keyed to a person — the
 * tickets they hold, the events they host, an attendee list, a gate scan — is
 * deliberately left uncached. Caching per-user reads is how a verified payment
 * once appeared to vanish, and at a gate a stale ticket status is worse than a
 * slow one.
 *
 * Two layers, doing different jobs:
 *
 *  - `cache()` from React dedupes a query *within one request*. Free, always
 *    correct, no staleness window.
 *  - `unstable_cache` keeps a result *across requests* until it expires or a
 *    mutation revalidates its tag.
 */

export const EVENTS_TAG = "events";
export const eventTag = (slug: string) => `event:${slug}`;

/** Short by design: correctness first, round-trips second. */
export const CACHE_SECONDS = {
  /** Catalogue: changes only when an organizer publishes or a seat is taken. */
  catalogue: 120,
  /** Finished events barely move. */
  past: 300,
  /** Detail pages carry live seat counts, so they get the shortest window. */
  detail: 60,
} as const;

/**
 * Drop the cached catalogue. Call after anything that changes what the public
 * would see: an event created, edited, published, deleted, or a ticket issued
 * (which moves the seats-left count).
 *
 * Safe to call from route handlers and server actions. Passing the slug also
 * clears that event's detail page.
 */
export function revalidateEvents(slug?: string | null) {
  revalidateTag(EVENTS_TAG);
  if (slug) revalidateTag(eventTag(slug));
}

/**
 * Same, for callers holding an id rather than a slug. The detail cache is keyed
 * by slug, so the slug has to be resolved — one cheap read, and only on a
 * mutation path.
 *
 * When the event has already been deleted there is no slug left to look up, so
 * pass the slug you captured beforehand instead of calling this.
 */
export async function revalidateEventById(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { slug: true },
  });
  revalidateEvents(event?.slug);
}

/**
 * Values coming back from the cross-request cache have been through JSON, so a
 * Date arrives as an ISO string. Revive them, and leave real Date objects
 * untouched so this stays correct whichever way the cache stores them.
 *
 * The pattern is the full ISO form Prisma emits; free-text fields like a venue
 * or description cannot collide with it.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function reviveDates<T>(value: T): T {
  if (typeof value === "string") {
    return (ISO_DATE.test(value) ? new Date(value) : value) as T;
  }
  if (Array.isArray(value)) return value.map(reviveDates) as T;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveDates(v);
    return out as T;
  }
  return value;
}

const catalogueSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  venue: true,
  startsAt: true,
  capacity: true,
  createdById: true,
  posterUploadId: true,
  _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
  ticketTypes: { select: { pricePaise: true } },
} as const;

/**
 * Published events still ahead of us.
 *
 * The `endsAt` cutoff is evaluated when the entry is built, so for up to
 * `catalogue` seconds an event that has just ended can still be listed.
 * `syncCompletedEvents` cannot close that window for us: it runs during a page
 * render, and `revalidateTag` is only legal in a route handler or server
 * action. So the staleness here is bounded by the TTL and nothing else — which
 * is why the TTL is two minutes rather than an hour.
 */
const cachedPublishedEvents = unstable_cache(
  async () =>
    prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      select: catalogueSelect,
    }),
  ["published-events"],
  { revalidate: CACHE_SECONDS.catalogue, tags: [EVENTS_TAG] },
);

const cachedPastEvents = unstable_cache(
  async () =>
    prisma.event.findMany({
      where: { status: EventStatus.COMPLETED, endsAt: { lt: new Date() } },
      orderBy: { endsAt: "desc" },
      take: 6,
      select: {
        id: true,
        slug: true,
        title: true,
        venue: true,
        endsAt: true,
        posterUploadId: true,
        _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
      },
    }),
  ["past-events"],
  { revalidate: CACHE_SECONDS.past, tags: [EVENTS_TAG] },
);

export async function getPublishedEvents() {
  return reviveDates(await cachedPublishedEvents());
}

export async function getPastEvents() {
  return reviveDates(await cachedPastEvents());
}

const detailSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  venue: true,
  startsAt: true,
  endsAt: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  status: true,
  capacity: true,
  createdById: true,
  posterUploadId: true,
  hostOrganization: true,
  addressLine: true,
  latitude: true,
  longitude: true,
  contactEmail: true,
  contactPhone: true,
  hosts: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      title: true,
      avatarUploadId: true,
      email: true,
      instagram: true,
      twitter: true,
      linkedin: true,
    },
  },
  _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
  ticketTypes: {
    orderBy: { pricePaise: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      pricePaise: true,
      capacity: true,
      salesStartAt: true,
      salesEndAt: true,
      requiresStudentId: true,
      requiresApproval: true,
      transferable: true,
      maxPerUser: true,
      paymentMode: true,
      organizerUpiId: true,
      _count: { select: { tickets: { where: { status: { in: LIVE_TICKET_STATUS_LIST } } } } },
    },
  },
} as const;

function cachedEventBySlug(slug: string) {
  return unstable_cache(
    // Fetched regardless of status: visibility is decided by the page, because
    // a host opens their own draft from the same link everyone else uses.
    async () => prisma.event.findFirst({ where: { slug }, select: detailSelect }),
    ["event-by-slug", slug],
    { revalidate: CACHE_SECONDS.detail, tags: [EVENTS_TAG, eventTag(slug)] },
  )();
}

/**
 * One event by slug, deduped within the request and cached across requests.
 *
 * The request-level `cache()` matters on its own: the detail page reads this
 * once for `generateMetadata` and once to render, which was two identical
 * round-trips per page view.
 */
export const getEventBySlug = cache(async (slug: string) => reviveDates(await cachedEventBySlug(slug)));

export type CatalogueEvent = Awaited<ReturnType<typeof getPublishedEvents>>[number];
export type PastEvent = Awaited<ReturnType<typeof getPastEvents>>[number];
export type DetailEvent = NonNullable<Awaited<ReturnType<typeof getEventBySlug>>>;
