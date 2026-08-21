"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Button } from "./ui";
import { useToast } from "./toast";

export function RegisterButton({
  eventId,
  ticketTypeId,
  disabledReason,
  label = "Register",
}: {
  eventId: string;
  ticketTypeId: string;
  /** When set, the server would refuse anyway — show why instead of a live button. */
  disabledReason?: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  if (disabledReason) {
    return (
      <p className="text-sm font-medium text-slate-500" role="status">
        {disabledReason}
      </p>
    );
  }

  async function register() {
    setPending(true);
    const result = await apiRequest<{ ticket: { publicId: string } }>(
      `/api/events/${eventId}/register`,
      "POST",
      { ticketTypeId },
    );

    if (!result.ok) {
      setPending(false);
      toast.push("error", result.message);
      // Capacity and window states may have changed since the page rendered.
      router.refresh();
      return;
    }

    toast.push("success", "Ticket issued. Check your email for confirmation.");
    router.push(`/student/tickets/${result.data.ticket.publicId}?new=1`);
    router.refresh();
  }

  return (
    <Button onClick={register} disabled={pending} className="w-full sm:w-auto">
      {pending ? "Registering…" : label}
    </Button>
  );
}
