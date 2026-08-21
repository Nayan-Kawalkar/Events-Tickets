"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Button, Card, cx } from "./ui";

type ScannerEvent = { id: string; title: string; startsAt: string; venue: string | null };

type Outcome =
  | { status: "APPROVED"; message: string; attendee: { name: string; rollNumber: string | null; ticketType: string }; checkedInAt: string }
  | { status: "REJECTED"; reason: string; message: string }
  | { status: "ERROR"; message: string };

type RecentScan = { at: number; label: string; approved: boolean };

const RESET_MS = 1400;
/**
 * How long the same code is ignored after it has been submitted once.
 *
 * Longer than RESET_MS on purpose: when the result clears, the attendee's QR is
 * usually still in front of the lens. Without this the scanner would re-submit
 * it the instant the panel disappeared, looping one ticket into many rejections.
 * A deliberate re-scan is still possible after the window, or immediately via
 * manual entry.
 */
const DUPLICATE_COOLDOWN_MS = 6000;

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

  // The ZXing callback is created once and closes over the values of that
  // render, so `busy`/`outcome` state is stale inside it. These refs are read
  // live instead, and are the real guard against repeat submissions.
  const processingRef = useRef(false);
  const resultShownRef = useRef(false);

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
      if (!eventId || processingRef.current) return;
      processingRef.current = true;
      setBusy(true);

      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

      // One silent retry: a single dropped request on venue wi-fi should not
      // look like a rejected ticket to the volunteer.
      const send = () =>
        fetch("/api/checkin/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ eventId, gateId, qrPayload: payload }),
          keepalive: true,
        });

      let result: Outcome;
      try {
        let res: Response;
        try {
          res = await send();
        } catch {
          res = await send();
        }

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
      processingRef.current = false;
      // A result is on screen: ignore further decodes until it clears, so one
      // QR held in front of the camera cannot produce a stream of results.
      resultShownRef.current = true;

      // Clear automatically so the next attendee can step up without a tap.
      resetTimerRef.current = setTimeout(() => {
        setOutcome(null);
        resultShownRef.current = false;
        // lastCodeRef is deliberately kept: the same QR is probably still in
        // frame, and must not be resubmitted the moment the panel clears.
      }, RESET_MS);
    },
    [eventId, gateId, signal],
  );

  /** Manual dismiss shares the reset path so the guards cannot get stuck on. */
  const clearResult = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setOutcome(null);
    resultShownRef.current = false;
  }, []);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    processingRef.current = false;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    // Never leave a previous decode session running against a detached video.
    controlsRef.current?.stop();
    controlsRef.current = null;
    try {
      // QR-only reader: the multi-format one also tries Data Matrix, PDF417 and
      // every 1D barcode on every frame, which is wasted work at a gate and
      // makes each read noticeably slower.
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 100,
      });

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            // Rear camera, and enough resolution to read a phone screen at
            // arm's length without hunting for focus.
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        },
        videoRef.current ?? undefined,
        (decoded) => {
          if (!decoded) return;
          // Read live refs, never captured state: this callback outlives the
          // render that created it.
          if (processingRef.current) return;

          const code = decoded.getText();
          const last = lastCodeRef.current;

          // The camera decodes every frame, so the same code must submit once
          // per cooldown — this is what stops one QR becoming a burst.
          if (last && last.code === code && Date.now() - last.at < DUPLICATE_COOLDOWN_MS) return;

          // A *different* ticket may interrupt a result still on screen: at a
          // gate the next person should not wait out the reset timer.
          if (resultShownRef.current) clearResult();

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

      {/* Always-visible banner: the single most common gate mistake is scanning
          with the wrong event selected, and the dropdown is easy to overlook. */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-500/30 bg-brand-500/10 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-400">
            Scanning for
          </p>
          <p className="truncate text-sm font-semibold text-slate-900">
            {events.find((e) => e.id === eventId)?.title ?? "No event selected"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-black/30 px-2.5 py-1 text-xs text-slate-700">
          {gateId || "no gate"}
        </span>
      </div>

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

      {/* The result is an overlay, never a replacement: unmounting the <video>
          would break the decode session while it kept reading the old stream,
          which produced a burst of repeat results from a single QR. */}
      {outcome ? <ResultPanel outcome={outcome} onDismiss={clearResult} /> : null}

      <Card className={cx("space-y-3", outcome && "hidden")}>
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
