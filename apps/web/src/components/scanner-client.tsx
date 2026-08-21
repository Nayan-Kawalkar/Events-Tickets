"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Button, Card, cx } from "./ui";

type ScannerEvent = { id: string; title: string; startsAt: string; venue: string | null };

type Outcome =
  | { status: "APPROVED"; message: string; attendee: { name: string; rollNumber: string | null; ticketType: string }; checkedInAt: string }
  | { status: "REJECTED"; reason: string; message: string }
  | { status: "ERROR"; message: string };

type RecentScan = { at: number; label: string; approved: boolean };

const RESET_MS = 2500;
/** Ignore the same code re-read by the camera within this window. */
const DUPLICATE_COOLDOWN_MS = 3000;

export function ScannerClient({ events }: { events: ScannerEvent[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [gateId, setGateId] = useState("DEFAULT");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [online, setOnline] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  /** Distinct feedback for approved vs rejected, so volunteers need not read. */
  const signal = useCallback((approved: boolean) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(approved ? 80 : [90, 70, 90]);
    }
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = approved ? 880 : 220;
      gain.gain.value = 0.08;
      osc.start();
      osc.stop(ctx.currentTime + (approved ? 0.12 : 0.32));
      osc.onended = () => ctx.close();
    } catch {
      // Audio is a nicety; never let it break scanning.
    }
  }, []);

  const submit = useCallback(
    async (payload: string) => {
      if (!eventId || busy) return;
      setBusy(true);

      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

      let result: Outcome;
      try {
        const res = await fetch("/api/checkin/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ eventId, gateId, qrPayload: payload }),
        });
        const data = await res.json().catch(() => ({}));
        result = res.ok
          ? (data as Outcome)
          : { status: "ERROR", message: (data as { message?: string }).message ?? "Validation failed." };
      } catch {
        result = { status: "ERROR", message: "No connection. Check the network and scan again." };
      }

      setOutcome(result);
      const approved = result.status === "APPROVED";
      signal(approved);

      setRecent((prev) =>
        [
          {
            at: Date.now(),
            label:
              result.status === "APPROVED"
                ? `${result.attendee.name} · ${result.attendee.ticketType}`
                : result.status === "REJECTED"
                  ? result.reason.replace(/_/g, " ").toLowerCase()
                  : "error",
            approved,
          },
          ...prev,
        ].slice(0, 5),
      );

      setBusy(false);
      // Clear automatically so the next attendee can step up without a tap.
      resetTimerRef.current = setTimeout(() => setOutcome(null), RESET_MS);
    },
    [busy, eventId, gateId, signal],
  );

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current ?? undefined,
        (decoded) => {
          if (!decoded) return;
          const code = decoded.getText();
          const last = lastCodeRef.current;
          // The camera reads continuously; do not resubmit the same code.
          if (last && last.code === code && Date.now() - last.at < DUPLICATE_COOLDOWN_MS) return;
          lastCodeRef.current = { code, at: Date.now() };
          void submit(code);
        },
      );
      controlsRef.current = controls;
      setScanning(true);
    } catch (err) {
      setCameraError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access, or use manual entry below."
          : "Could not start the camera. Use manual entry below.",
      );
      setScanning(false);
    }
  }, [submit]);

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  if (events.length === 0) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          You have no events to scan. An event must be published or closed, and created by you
          (admins can scan any event).
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!online ? (
        <div role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-200">
          No network connection. Check-ins cannot be validated until it returns.
        </div>
      ) : null}

      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="event" className="mb-1.5 block text-sm font-medium text-slate-800">
              Event
            </label>
            <select
              id="event"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-white/20 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gate" className="mb-1.5 block text-sm font-medium text-slate-800">
              Gate
            </label>
            <input
              id="gate"
              value={gateId}
              onChange={(e) => setGateId(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-white/20 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              placeholder="Main Gate"
            />
          </div>
        </div>
      </Card>

      {/* Result takes the whole screen on a phone: readable at arm's length. */}
      {outcome ? (
        <ResultPanel outcome={outcome} onDismiss={() => setOutcome(null)} />
      ) : (
        <Card className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
            <video
              ref={videoRef}
              className="aspect-square w-full object-cover"
              muted
              playsInline
              aria-label="Camera preview"
            />
            {!scanning ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 text-center text-sm text-slate-700">
                {busy ? "Checking…" : "Camera is off"}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            {scanning ? (
              <Button variant="secondary" onClick={stopCamera} className="flex-1">
                Stop camera
              </Button>
            ) : (
              <Button onClick={startCamera} className="flex-1">
                Start camera
              </Button>
            )}
          </div>

          {cameraError ? (
            <p role="alert" className="text-sm font-medium text-red-300">
              {cameraError}
            </p>
          ) : null}

          <form
            className="flex gap-2 border-t border-white/8 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const code = manualCode.trim();
              if (!code) return;
              setManualCode("");
              void submit(code);
            }}
          >
            <label htmlFor="manual" className="sr-only">
              Enter ticket code manually
            </label>
            <input
              id="manual"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Paste ticket code (manual entry)"
              className="min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500 transition-colors hover:border-white/20 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              Check
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Last 5 scans
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">No scans yet.</p>
        ) : (
          <ul className="divide-y divide-white/6 text-sm">
            {recent.map((scan) => (
              <li key={scan.at} className="row-hover flex items-center justify-between rounded px-1 py-2">
                <span className="text-slate-700">{scan.label}</span>
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    scan.approved
                      ? "bg-brand-500/15 text-brand-300 ring-brand-500/40"
                      : "bg-red-500/15 text-red-300 ring-red-400/40",
                  )}
                >
                  {scan.approved ? "✓ in" : "✕ no"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ResultPanel({ outcome, onDismiss }: { outcome: Outcome; onDismiss: () => void }) {
  const approved = outcome.status === "APPROVED";

  return (
    <div
      role="alert"
      className={cx(
        "rounded-2xl p-6 text-center text-white shadow-lg",
        approved ? "bg-emerald-600" : "bg-red-600",
      )}
    >
      {/* Symbol as well as colour: never rely on colour alone. */}
      <p className="text-6xl leading-none" aria-hidden="true">
        {approved ? "✓" : "✕"}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight">
        {approved ? "APPROVED" : "REJECTED"}
      </p>

      {outcome.status === "APPROVED" ? (
        <div className="mt-3 space-y-1">
          <p className="text-xl font-semibold">{outcome.attendee.name}</p>
          <p className="text-white/90">{outcome.attendee.ticketType}</p>
          {outcome.attendee.rollNumber ? (
            <p className="font-mono text-sm text-white/80">{outcome.attendee.rollNumber}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-lg font-medium">{outcome.message}</p>
      )}

      <button
        type="button"
        onClick={onDismiss}
        className="mt-5 min-h-11 w-full rounded-lg bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
      >
        Next scan
      </button>
    </div>
  );
}
