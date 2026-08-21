import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@ct/db";
import { getCurrentUser, type SessionUser } from "./auth";
import { canAccessOrganizerArea, findManageableEvent } from "./authz";
import { forbidden, notFound, unauthorized } from "./api";
import { LIVE_TICKET_STATUS_LIST } from "./ticket-status";

type Guarded<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/** Require a signed-in ORGANIZER or ADMIN for an API route. */
export async function requireOrganizerApi(): Promise<Guarded<SessionUser>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: unauthorized() };
  if (!canAccessOrganizerArea(user)) return { ok: false, response: forbidden() };
  return { ok: true, value: user };
}

/**
 * Require an event the caller may manage. Unowned and non-existent events both
 * return 404 so IDs cannot be enumerated.
 */
export async function requireManageableEvent(user: SessionUser, eventId: string) {
  const event = await findManageableEvent(user, eventId);
  if (!event) return { ok: false as const, response: notFound() };
  return { ok: true as const, value: event };
}

export function countLiveTickets(where: { eventId?: string; ticketTypeId?: string }) {
  return prisma.ticket.count({
    where: { ...where, status: { in: LIVE_TICKET_STATUS_LIST } },
  });
}
