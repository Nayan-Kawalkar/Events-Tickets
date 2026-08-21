import type { Metadata } from "next";
import { prisma, EventStatus, Role } from "@ct/db";
import { ScannerClient } from "@/components/scanner-client";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Gate scanner" };
export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  // Students never reach this page; the API repeats the check independently.
  const user = await requireRole([Role.ORGANIZER, Role.ADMIN], "/scanner");

  const events = await prisma.event.findMany({
    where: {
      status: { in: [EventStatus.PUBLISHED, EventStatus.CLOSED] },
      ...(user.role === Role.ADMIN ? {} : { createdById: user.id }),
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, venue: true },
  });

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Gate scanner"
        description="Scan the attendee's QR. Each ticket admits one person, once."
      />
      <ScannerClient
        events={events.map((event) => ({
          id: event.id,
          title: event.title,
          startsAt: event.startsAt.toISOString(),
          venue: event.venue,
        }))}
      />
    </div>
  );
}
