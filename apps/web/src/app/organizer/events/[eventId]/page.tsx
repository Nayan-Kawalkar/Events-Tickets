import { notFound, redirect } from "next/navigation";
import { Role } from "@ct/db";
import { requireRole } from "@/lib/auth";
import { findManageableEvent } from "@/lib/authz";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ eventId: string }> };

/**
 * The separate management hub is gone: a host manages their event from the
 * event page itself, which is where they land from any listing. This keeps
 * older links and bookmarks working.
 */
export default async function LegacyEventHubPage({ params }: Props) {
  const [user, { eventId }] = await Promise.all([
    requireRole([Role.ORGANIZER, Role.ADMIN]),
    params,
  ]);

  const idResult = uuidSchema.safeParse(eventId);
  if (!idResult.success) notFound();

  const event = await findManageableEvent(user, idResult.data);
  if (!event) notFound();

  redirect(`/events/${event.slug}`);
}
