import "server-only";
import { prisma, ManualPaymentStatus, Role, TicketStatus, type Event } from "@ct/db";
import type { SessionUser } from "./auth";

/**
 * Recent things that happened *to this person*, with somewhere to go.
 *
 * Derived from the domain tables rather than a notifications table. That keeps
 * one source of truth — a payment's status is the notification — so nothing can
 * say "verified" while the payment says otherwise, and there is no delivery or
 * backfill to get wrong.
 *
 * The cost of that choice is honest: there is no per-item read state, so
 * recency does the work instead. An item ages out of the window rather than
 * being dismissed.
 *
 * Never cached. This is per-user by definition, and a stale "your ticket is
 * ready" is worse than none.
 */

export type UpdateTone = "success" | "warning" | "info";

export type Update = {
  id: string;
  tone: UpdateTone;
  title: string;
  detail?: string;
  href: string;
  /** What to call the link. Kept short: it sits on one line on a phone. */
  action: string;
  at: Date;
};

/** How far back an item stays worth showing. */
const WINDOW_DAYS = 14;
const MAX_ITEMS = 5;

function since() {
  return new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Events this organizer may act on. Admins see everything. */
function ownedEventsWhere(user: SessionUser) {
  return user.role === Role.ADMIN ? {} : { createdById: user.id };
}

async function studentUpdates(user: SessionUser): Promise<Update[]> {
  const cutoff = since();

  const [payments, tickets] = await Promise.all([
    prisma.manualPayment.findMany({
      where: {
        userId: user.id,
        status: { in: [ManualPaymentStatus.VERIFIED, ManualPaymentStatus.REJECTED] },
        // Decided recently, rather than merely created recently.
        verifiedAt: { gte: cutoff },
      },
      orderBy: { verifiedAt: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        status: true,
        verifiedAt: true,
        rejectionReason: true,
        event: { select: { title: true, slug: true } },
        issuedTicket: { select: { publicId: true } },
      },
    }),
    prisma.ticket.findMany({
      where: {
        ownerUserId: user.id,
        status: { in: [TicketStatus.CANCELLED, TicketStatus.BLOCKED] },
        updatedAt: { gte: cutoff },
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        publicId: true,
        status: true,
        updatedAt: true,
        event: { select: { title: true } },
      },
    }),
  ]);

  const items: Update[] = [];

  for (const p of payments) {
    if (p.status === ManualPaymentStatus.VERIFIED) {
      items.push({
        id: `pay-${p.id}`,
        tone: "success",
        title: "Payment verified — your ticket is ready",
        detail: p.event.title,
        // Straight to the QR they will actually need at the gate.
        href: p.issuedTicket ? `/tickets/${p.issuedTicket.publicId}` : "/tickets",
        action: "View ticket",
        at: p.verifiedAt ?? new Date(),
      });
    } else {
      items.push({
        id: `pay-${p.id}`,
        tone: "warning",
        title: "Payment could not be verified",
        detail: p.rejectionReason ? `${p.event.title} — ${p.rejectionReason}` : p.event.title,
        href: `/events/${p.event.slug}`,
        action: "Try again",
        at: p.verifiedAt ?? new Date(),
      });
    }
  }

  for (const t of tickets) {
    items.push({
      id: `tkt-${t.id}`,
      tone: "warning",
      title: t.status === TicketStatus.CANCELLED ? "A ticket was cancelled" : "A ticket was put on hold",
      detail: t.event.title,
      href: `/tickets/${t.publicId}`,
      action: "See details",
      at: t.updatedAt,
    });
  }

  return items;
}

async function organizerUpdates(user: SessionUser): Promise<Update[]> {
  const scope = ownedEventsWhere(user);

  const [pending, startingSoon] = await Promise.all([
    // Grouped rather than listed: five separate "someone paid" rows would bury
    // everything else, and the action is the same for all of them.
    prisma.manualPayment.findMany({
      where: { status: ManualPaymentStatus.PENDING, event: scope },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, createdAt: true, eventId: true, event: { select: { title: true } } },
    }),
    prisma.event.findMany({
      where: {
        ...scope,
        startsAt: { gte: new Date(), lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        status: { in: ["PUBLISHED", "CLOSED"] as Event["status"][] },
      },
      orderBy: { startsAt: "asc" },
      take: 3,
      select: { id: true, title: true, startsAt: true },
    }),
  ]);

  const items: Update[] = [];

  if (pending.length > 0) {
    // Grouped per event so the link can go straight to the right queue.
    const byEvent = new Map<string, { title: string; count: number; oldest: Date }>();
    for (const p of pending) {
      const row = byEvent.get(p.eventId);
      if (row) row.count += 1;
      else byEvent.set(p.eventId, { title: p.event.title, count: 1, oldest: p.createdAt });
    }

    for (const [eventId, row] of byEvent) {
      items.push({
        id: `pending-${eventId}`,
        tone: "info",
        title:
          row.count === 1
            ? "1 payment is waiting for you to verify"
            : `${row.count} payments are waiting for you to verify`,
        detail: row.title,
        href: `/organizer/events/${eventId}/payments`,
        action: "Review",
        at: row.oldest,
      });
    }
  }

  for (const e of startingSoon) {
    items.push({
      id: `soon-${e.id}`,
      tone: "info",
      title: "Your event starts within a day",
      detail: e.title,
      href: `/scanner?event=${e.id}`,
      action: "Open scanner",
      at: e.startsAt,
    });
  }

  return items;
}

/**
 * The feed for whoever is signed in.
 *
 * Organizers also get the student items: they buy tickets too, and a verified
 * payment of their own matters to them just as much.
 */
export async function recentUpdates(user: SessionUser | null): Promise<Update[]> {
  if (!user) return [];

  try {
    const groups = await Promise.all([
      studentUpdates(user),
      user.role === Role.ORGANIZER || user.role === Role.ADMIN
        ? organizerUpdates(user)
        : Promise.resolve([]),
    ]);

    return groups
      .flat()
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, MAX_ITEMS);
  } catch (err) {
    // A broken feed must never take the home page down with it.
    console.error("[updates] could not build the feed", err);
    return [];
  }
}
