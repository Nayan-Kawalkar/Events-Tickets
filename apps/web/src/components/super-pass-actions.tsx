"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { Button } from "./ui";
import { useToast } from "./toast";

/** Issue a new master pass, replacing any active one. */
export function IssueSuperPass({ hasActive }: { hasActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState("");
  const [ttl, setTtl] = useState("15");

  async function issue() {
    if (
      hasActive &&
      !confirm("Issuing a new master pass revokes the current one immediately. Continue?")
    ) {
      return;
    }

    setPending(true);
    const result = await apiRequest("/api/admin/super-passes", "POST", {
      label,
      ttlMinutes: ttl,
    });
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", "New master pass issued.");
    setLabel("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="sp-label" className="mb-1.5 block text-sm font-medium text-slate-800">
          Label
        </label>
        <input
          id="sp-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Chief guest"
          className="min-h-11 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500"
        />
      </div>

      <div>
        <label htmlFor="sp-ttl" className="mb-1.5 block text-sm font-medium text-slate-800">
          Valid for
        </label>
        <select
          id="sp-ttl"
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
          className="min-h-11 rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 [&>option]:bg-[#0b2a27]"
        >
          <option value="5">5 minutes</option>
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
        </select>
      </div>

      <Button onClick={issue} disabled={pending}>
        {pending ? "Issuing…" : hasActive ? "Replace with new pass" : "Generate master pass"}
      </Button>
    </div>
  );
}

export function RevokeSuperPass() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function revoke() {
    if (!confirm("Revoke the active master pass? It will stop working immediately.")) return;

    setPending(true);
    const result = await apiRequest("/api/admin/super-passes", "DELETE");
    setPending(false);

    if (!result.ok) {
      toast.push("error", result.message);
      return;
    }
    toast.push("success", "Master pass revoked.");
    router.refresh();
  }

  return (
    <Button variant="danger" onClick={revoke} disabled={pending}>
      Revoke
    </Button>
  );
}

/** Live countdown, so an admin can see the pass expiring rather than guessing. */
export function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      const next = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(next);
      // Refresh once at expiry so the page stops offering a dead QR.
      if (next === 0) router.refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, router]);

  if (remaining === 0) return <span className="text-red-300">expired</span>;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <span className={remaining < 60000 ? "text-amber-300" : "text-brand-300"}>
      {minutes}:{String(seconds).padStart(2, "0")} left
    </span>
  );
}
