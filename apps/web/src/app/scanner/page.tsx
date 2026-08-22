import type { Metadata } from "next";
import { prisma, EventStatus, Role } from "@ct/db";
import { ScannerClient } from "@/components/scanner-client";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { scannableEventsWhere } from "@/lib/authz";

export const metadata: Metadata = { title: "Gate scanner" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ event?: string }> };

export default async function ScannerPage({ searchParams }: Props) {
  // Students never reach this page; the API repeats the check independently.
  const [user, sp] = await Promise.all([
    requireRole([Role.SCANNER, Role.ORGANIZER, Role.ADMIN], "/scanner"),
    searchParams,
  ]);

  const events = await prisma.event.findMany({
    where: {
      status: { in: [EventStatus.PUBLISHED, EventStatus.CLOSED] },
      ...scannableEventsWhere(user),
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true, venue: true },
  });

  return (
    <div className="mx-auto max-w-md sm:max-w-lg">
      <PageHeader
        title="Gate scanner"
        description="Scan the attendee's QR. Each ticket admits one person, once."
      />
      <ScannerClient
        // Arriving from an event page pre-selects it, which is the single
        // biggest source of wrong-event rejections at a gate.
        initialEventId={sp.event}
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
