import ExcelJS from "exceljs";
import { Role } from "@ct/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessOrganizerArea, findManageableEvent } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { buildAttendeeExport } from "@/lib/attendee-export";
import { fail, forbidden, notFound, unauthorized } from "@/lib/api";
import { uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventId: string }> };

/**
 * The guest list as a real .xlsx.
 *
 * CSV already exists and stays: it is the right thing for importing elsewhere.
 * This is for the far commoner case of someone opening the file to read it —
 * dates arrive as dates rather than text, the money column adds up, the header
 * stays put while scrolling, and long names are not clipped to one width.
 */
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

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CampusPass";
  workbook.created = new Date();

  // Excel refuses sheet names over 31 characters or containing : \ / ? * [ ].
  const sheetName = event.title.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Attendees";
  const sheet = workbook.addWorksheet(sheetName, {
    // Freezing row 1 keeps the column names visible down a long guest list.
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A2F" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 22;

  // Filter arrows on every column: an organizer's first move is almost always
  // "show me only the ones who have not checked in".
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  sheet.columns.forEach((column, index) => {
    const header = headers[index] ?? "";

    // Real date cells, so sorting is chronological rather than alphabetical.
    if (/at$/i.test(header)) {
      column.numFmt = "dd mmm yyyy hh:mm";
      column.width = 20;
      return;
    }
    if (header === "Price (₹)") {
      column.numFmt = "#,##0.00";
      column.width = 12;
      return;
    }

    // Width from the widest value, bounded so one long answer cannot push a
    // column off the screen.
    let widest = header.length;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const text = cell.value instanceof Date ? "0000-00-00 00:00" : String(cell.value ?? "");
      if (text.length > widest) widest = text.length;
    });
    column.width = Math.min(Math.max(widest + 2, 10), 45);
  });

  // Exporting personal data is an auditable action.
  await audit({
    actorUserId: user.id,
    entityType: "Event",
    entityId: event.id,
    action: "ATTENDEES_EXPORTED",
    metadata: {
      rowCount: count,
      format: "xlsx",
      actorRole: user.role === Role.ADMIN ? "ADMIN" : "ORGANIZER",
    },
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `attendees-${event.slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
