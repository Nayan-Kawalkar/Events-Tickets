"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EventStatus } from "@/lib/enums";
import { apiRequest } from "@/lib/client-api";
import { Button } from "./ui";
import { useToast } from "./toast";

/** Publish / close / reopen shortcuts on the event list. */
export function EventStatusActions({ eventId, status }: { eventId: string; status: EventStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function change(next: EventStatus, label: string) {
    setPending(true);
    const result = await apiRequest(`/api/organizer/events/${eventId}`, "PATCH", { status: next });
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", label);
    router.refresh();
  }

  if (status === EventStatus.CANCELLED || status === EventStatus.COMPLETED) return null;

  return (
    <>
      {status === EventStatus.DRAFT || status === EventStatus.CLOSED ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => change(EventStatus.PUBLISHED, "Event published.")}
        >
          Publish
        </Button>
      ) : null}

      {status === EventStatus.PUBLISHED ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => change(EventStatus.CLOSED, "Event closed for registration.")}
        >
          Close
        </Button>
      ) : null}
    </>
  );
}
