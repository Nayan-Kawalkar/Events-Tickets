"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Button } from "./ui";
import { useToast } from "./toast";

type Outcome =
  | { status: "APPROVED"; attendee: { name: string; ticketType: string } }
  | { status: "REJECTED"; message: string };

/**
 * Admit one attendee without a QR.
 *
 * Asks for confirmation naming the person: without a scan the only safeguard
 * against admitting the wrong row is the operator reading it.
 */
export function ManualCheckinButton({
  eventId,
  ticketId,
  attendeeName,
  gateId = "HELP_DESK",
}: {
  eventId: string;
  ticketId: string;
  attendeeName: string;
  gateId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function checkIn() {
    if (
      !confirm(
        `Check in ${attendeeName} without scanning?\n\nVerify their college ID first. This is recorded as a manual admission.`,
      )
    ) {
      return;
    }

    const reason = window.prompt("Why is this manual? (e.g. phone battery dead)") ?? "";

    setPending(true);
    const result = await apiRequest<Outcome>("/api/checkin/manual", "POST", {
      eventId,
      ticketId,
      gateId,
      reason,
    });
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }

    if (result.data.status === "REJECTED") {
      toast.push("error", result.data.message);
      router.refresh();
      return;
    }

    toast.push("success", `${result.data.attendee.name} checked in.`);
    router.refresh();
  }

  return (
    <Button variant="secondary" disabled={pending} onClick={checkIn}>
      {pending ? "Checking in…" : "Check in"}
    </Button>
  );
}
