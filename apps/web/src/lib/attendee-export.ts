import "server-only";
import { prisma } from "@ct/db";
import { storedAnswers } from "./attendee-fields";

/**
 * The guest list, shaped for export.
 *
 * Shared by the CSV and Excel routes so the two can never disagree about which
 * columns exist or what a cell contains — only the file format differs.
 */

export const FIXED_COLUMNS = [
  "Ticket ID",
  "Attendee name",
  "Email",
  "Phone",
  "Roll number",
  "Department",
  "Account email",
  "Ticket type",
  "Price (₹)",
  "Status",
  "Issued at",
  "Checked in at",
  "Terms accepted at",
] as const;

export type AttendeeExport = {
  /** Question columns, in the order they first appear across the tickets. */
  questionLabels: string[];
  headers: string[];
  /** Dates stay as Date objects so Excel can format them as real dates. */
  rows: (string | number | Date | null)[][];
  count: number;
};

export async function buildAttendeeExport(eventId: string): Promise<AttendeeExport> {
  const tickets = await prisma.ticket.findMany({
    relationLoadStrategy: "join",
    where: { eventId },
    orderBy: { issuedAt: "asc" },
    select: {
      publicId: true,
      status: true,
      issuedAt: true,
      checkedInAt: true,
      attendeeName: true,
      attendeeEmail: true,
      attendeePhone: true,
      attendeeRollNumber: true,
      attendeeDepartment: true,
      termsAcceptedAt: true,
      customAnswers: true,
      owner: { select: { fullName: true, email: true, rollNumber: true, department: true } },
      ticketType: { select: { name: true, pricePaise: true } },
    },
  });

  // One column per question, built from the answers actually present. Labels
  // come from the tickets rather than the current questions, so answers to a
  // question since deleted still export instead of vanishing.
  const answersByTicket = tickets.map((t) => storedAnswers(t.customAnswers));
  const questionLabels: string[] = [];
  for (const answers of answersByTicket) {
    for (const a of answers) {
      if (!questionLabels.includes(a.label)) questionLabels.push(a.label);
    }
  }

  const rows = tickets.map((t, i) => [
    t.publicId,
    t.attendeeName ?? t.owner.fullName,
    t.attendeeEmail ?? t.owner.email,
    t.attendeePhone ?? "",
    t.attendeeRollNumber ?? t.owner.rollNumber ?? "",
    t.attendeeDepartment ?? t.owner.department ?? "",
    t.owner.email,
    t.ticketType.name,
    // Rupees rather than paise: a spreadsheet is read by people, and the raw
    // integer invites someone to sum a column that is off by a factor of 100.
    t.ticketType.pricePaise / 100,
    t.status,
    t.issuedAt,
    t.checkedInAt,
    t.termsAcceptedAt,
    ...questionLabels.map(
      (label) => answersByTicket[i]?.find((a) => a.label === label)?.value ?? "",
    ),
  ]);

  return {
    questionLabels,
    headers: [...FIXED_COLUMNS, ...questionLabels],
    rows,
    count: tickets.length,
  };
}
