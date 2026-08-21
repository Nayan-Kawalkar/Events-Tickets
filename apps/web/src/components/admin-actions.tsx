"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { EventStatus } from "@/lib/enums";
import { Button } from "./ui";
import { useToast } from "./toast";

/** Status override and delete for any event, regardless of who created it. */
export function AdminEventActions({
  eventId,
  status,
  ticketCount,
}: {
  eventId: string;
  status: EventStatus;
  ticketCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function run(method: "PATCH" | "DELETE", body: unknown, success: string) {
    setPending(true);
    const result = await apiRequest(`/api/admin/events/${eventId}`, method, body);
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", success);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`status-${eventId}`} className="sr-only">
        Event status
      </label>
      <select
        id={`status-${eventId}`}
        defaultValue={status}
        disabled={pending}
        onChange={(e) => run("PATCH", { status: e.target.value }, "Status updated.")}
        className="min-h-11 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 [&>option]:bg-[#0b2a27]"
      >
        {Object.values(EventStatus).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <Button
        variant="danger"
        disabled={pending || ticketCount > 0}
        title={ticketCount > 0 ? "Cancel it instead — tickets exist" : undefined}
        onClick={() => {
          if (confirm("Delete this event permanently? This cannot be undone.")) {
            void run("DELETE", undefined, "Event deleted.");
          }
        }}
      >
        Delete
      </Button>
    </div>
  );
}

/** Support actions on a single ticket. */
export function AdminTicketActions({
  ticketId,
  status,
}: {
  ticketId: string;
  status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function run(action: string, success: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;

    const reason = window.prompt("Reason (recorded in the audit log):") ?? "";
    setPending(true);
    const result = await apiRequest(`/api/admin/tickets/${ticketId}`, "POST", { action, reason });
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", success);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "BLOCKED" ? (
        <Button variant="secondary" disabled={pending} onClick={() => run("BLOCK", "Ticket blocked.")}>
          Block
        </Button>
      ) : null}

      {status !== "ISSUED" && status !== "CHECKED_IN" ? (
        <Button variant="secondary" disabled={pending} onClick={() => run("REINSTATE", "Ticket reinstated.")}>
          Reinstate
        </Button>
      ) : null}

      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          run("REISSUE", "New ticket issued, old one cancelled.", "Reissue this ticket? The current QR stops working immediately.")
        }
      >
        Reissue
      </Button>

      {status !== "CANCELLED" ? (
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => run("CANCEL", "Ticket cancelled.", "Cancel this ticket?")}
        >
          Cancel
        </Button>
      ) : null}
    </div>
  );
}
