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

  if (status === EventStatus.CANCELLED) return null;

  // A completed event has no status action worth offering: re-publishing it
  // while its end date is in the past would just age it back to COMPLETED on
  // the next listing. Point at the real fix instead.
  if (status === EventStatus.COMPLETED) {
    return (
      <span className="text-xs text-slate-500">
        Finished. To reopen it, change the end date first.
      </span>
    );
  }

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
