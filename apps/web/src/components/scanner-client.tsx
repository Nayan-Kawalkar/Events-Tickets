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

/**
 * How long one check-in request may take before it is abandoned.
 *
 * Generous next to a healthy check (well under a second) but short enough that
 * a stalled request becomes a retry the volunteer can act on rather than a
 * scanner that appears to have died.
 */
const SCAN_TIMEOUT_MS = 6000;

export function ScannerClient({
  events,
  initialEventId,
}: {
  events: ScannerEvent[];
  initialEventId?: string;
}) {
  // Only honour the hint if it names an event this scanner may actually work.
  const [eventId, setEventId] = useState(
    events.some((e) => e.id === initialEventId) ? initialEventId! : (events[0]?.id ?? ""),
  );
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

  /**
   * Three outcomes, three sounds, so a volunteer never has to read the screen.
   *
   * "Already used" is deliberately its own signal rather than a plain rejection:
   * it calls for a different response at the gate. An invalid QR means refuse
   * entry; a ticket already scanned means talk to the person in front of you,
   * because either they are trying it twice or someone came in on their ticket.
   * Those sounding identical is what made the distinction easy to miss.
   */
  const signal = useCallback((kind: "approved" | "duplicate" | "rejected" | "unknown") => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      // Approved is one pulse, duplicate a quick double, rejection a long
      // stutter — recognisable in a pocket as well as through the speaker.
      // "Unknown" is the shortest of all: nothing was decided, so it must not
      // feel like a verdict.
      navigator.vibrate(
        kind === "approved"
          ? 80
          : kind === "unknown"
            ? 30
            : kind === "duplicate"
              ? [40, 60, 40]
              : [90, 70, 90],
      );
    }
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();

      const tone = (frequency: number, startAt: number, seconds: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frequency;
        gain.gain.value = 0.08;
        osc.start(ctx.currentTime + startAt);
        osc.stop(ctx.currentTime + startAt + seconds);
        return osc;
      };

      let last: OscillatorNode;
      if (kind === "approved") {
        last = tone(880, 0, 0.12);
      } else if (kind === "unknown") {
        // Quiet and short, clearly not the refusal buzz: this is "ask them to
        // hold it up again", not "turn them away".
        last = tone(660, 0, 0.07);
      } else if (kind === "duplicate") {
        // Two mid pips: neither the high single note of a pass nor the low
        // buzz of a refusal, so it cannot be mistaken for either.
        tone(520, 0, 0.09);
        last = tone(520, 0.14, 0.09);
      } else {
        last = tone(220, 0, 0.32);
      }

      // Closed once the final tone finishes; closing earlier cuts it short.
      last.onended = () => ctx.close();
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
          // A gate cannot wait on a socket that will never answer. Without a
          // deadline a stalled request hangs the scanner indefinitely and the
          // queue stops entirely; failing fast turns that into "try again",
          // which a volunteer can act on.
          signal: AbortSignal.timeout(SCAN_TIMEOUT_MS),
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

      // Every "this pass was already scanned" reason, whatever kind of pass it
      // was, so a VIP or master pass sounds the same as a ticket.
      const alreadyUsed =
        result.status === "REJECTED" &&
        (result.reason === "ALREADY_USED" ||
          result.reason === "VIP_PASS_USED" ||
          result.reason === "SUPER_PASS_USED");

      // The request never landed, so the ticket was never judged. Forget the
      // code immediately: the attendee is still holding it up, and the whole
      // point is that presenting it again retries straight away instead of
      // being swallowed by the duplicate cooldown.
      if (result.status === "ERROR") lastCodeRef.current = null;

      signal(
        approved ? "approved" : result.status === "ERROR" ? "unknown" : alreadyUsed ? "duplicate" : "rejected",
      );

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
      // 100ms between attempts is only ten looks per second, and a phone screen
      // held at arm's length is in focus for a fraction of that. Halving it
      // roughly doubles the chances of catching a good frame.
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 50,
        delayBetweenScanSuccess: 50,
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
          {/* Shown while a scan is in flight *even with the camera running*.
              Without this the volunteer sees a live picture and nothing else
              for the second or two the check takes, assumes the code was never
              read, and starts waving the phone about — which is the surest way
              to lose the frame that would have worked. */}
          {busy || !scanning ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
              {busy ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-brand-400"
                  />
                  <span className="text-base font-medium text-white">Checking…</span>
                  <span className="text-xs text-white/60">Hold the code still</span>
                </>
              ) : (
                <span className="text-sm text-slate-700">Camera is off</span>
              )}
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

        {/* Phone dead or QR unreadable: find the person by name instead. */}
        {eventId ? (
          <a
            href={`/organizer/events/${eventId}/attendees`}
            className="block text-center text-xs text-slate-500 underline-offset-2 hover:text-brand-300 hover:underline"
          >
            Can&apos;t scan? Find the attendee by name →
          </a>
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

  /**
   * A failed request is not a refusal.
   *
   * This used to render red "REJECTED" whenever the status was not APPROVED,
   * which meant a dropped request on venue wi-fi accused a valid attendee of
   * having a bad ticket — and the volunteer only found out it was fine after
   * trying three or four times. Amber says "we do not know yet, try again",
   * which is the truth.
   */
  const unknown = outcome.status === "ERROR";

  return (
    <div
      role="alert"
      className={cx(
        "rounded-2xl p-6 text-center text-white shadow-lg",
        approved ? "bg-emerald-600" : unknown ? "bg-amber-600" : "bg-red-600",
      )}
    >
      {/* Symbol as well as colour: never rely on colour alone. */}
      <p className="text-6xl leading-none" aria-hidden="true">
        {approved ? "✓" : unknown ? "↻" : "✕"}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight">
        {approved ? "APPROVED" : unknown ? "TRY AGAIN" : "REJECTED"}
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
