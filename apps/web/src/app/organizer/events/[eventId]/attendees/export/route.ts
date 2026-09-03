import { Role } from "@ct/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessOrganizerArea, findManageableEvent } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { fail, forbidden, notFound, unauthorized } from "@/lib/api";
import { toCsv } from "@/lib/format";
import { buildAttendeeExport } from "@/lib/attendee-export";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (!canAccessOrganizerArea(user)) return forbidden();

  const idResult = uuidSchema.safeParse((await params).eventId);
  if (!idResult.success) return fail(400, "INVALID_ID", "Invalid event id.");

  // Attendee data is only ever released to someone who can manage the event.
  const event = await findManageableEvent(user, idResult.data);
  if (!event) return notFound();

  const { headers, rows, count } = await buildAttendeeExport(event.id);

  // Same columns as the Excel export; only the encoding differs. Dates are
  // ISO here because a CSV is usually being fed to another program.
  const csv = toCsv([
    headers,
    ...rows.map((row) => row.map((cell) => (cell instanceof Date ? cell.toISOString() : cell ?? ""))),
  ]);

  // Exporting personal data is an auditable action.
  await audit({
    actorUserId: user.id,
    entityType: "Event",
    entityId: event.id,
    action: "ATTENDEES_EXPORTED",
    metadata: { rowCount: count, format: "csv", actorRole: user.role === Role.ADMIN ? "ADMIN" : "ORGANIZER" },
  });

  const filename = `attendees-${event.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
