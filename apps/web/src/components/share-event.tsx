"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Link2, Share2, X } from "lucide-react";
import { cx } from "./ui";

/**
 * Share sheet for an event: a QR card, and the three things people actually do
 * with one — send it, copy the link, or save the image to post elsewhere.
 *
 * The QR is rendered by the server and handed in as a data URL, so the panel
 * opens with the code already there rather than generating one on click.
 */
export function ShareEvent({
  url,
  title,
  qrDataUrl,
  venue,
}: {
  url: string;
  title: string;
  qrDataUrl: string;
  venue?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Escape closes, and the page behind must not scroll under the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  /**
   * Compose the card as an image: QR, event name, and the link underneath.
   *
   * Drawn here rather than saving the bare QR because the saved image is meant
   * to be posted on its own — a naked QR tells nobody what they are scanning.
   */
  const composeCard = useCallback(async (): Promise<Blob | null> => {
    try {
      const W = 1080;
      const H = 1350;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      const qr = new Image();
      qr.src = qrDataUrl;
      await new Promise((resolve, reject) => {
        qr.onload = resolve;
        qr.onerror = reject;
      });

      const qrSize = 760;
      ctx.drawImage(qr, (W - qrSize) / 2, 150, qrSize, qrSize);

      ctx.textAlign = "center";
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 62px Inter, system-ui, sans-serif";

      // Long titles are trimmed rather than allowed to run off the canvas.
      let text = title;
      while (ctx.measureText(text).width > W - 140 && text.length > 4) {
        text = text.slice(0, -2);
      }
      if (text !== title) text += "…";
      ctx.fillText(text, W / 2, 1030);

      if (venue) {
        ctx.fillStyle = "#64748b";
        ctx.font = "40px Inter, system-ui, sans-serif";
        let place = venue;
        while (ctx.measureText(place).width > W - 160 && place.length > 4) {
          place = place.slice(0, -2);
        }
        ctx.fillText(place === venue ? place : place + "…", W / 2, 1100);
      }

      ctx.fillStyle = "#94a3b8";
      ctx.font = "34px Inter, system-ui, sans-serif";
      ctx.fillText(url.replace(/^https?:\/\//, ""), W / 2, venue ? 1180 : 1120);

      return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    } catch {
      return null;
    }
  }, [qrDataUrl, title, url, venue]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the link is on screen to copy by hand.
    }
  }, [url]);

  const share = useCallback(async () => {
    const blob = await composeCard();
    const file = blob ? new File([blob], "event.png", { type: "image/png" }) : null;

    try {
      // Sharing the card itself where the platform allows it, so the QR travels
      // with the message instead of a bare link.
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: title, url });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text: title, url });
        return;
      }
    } catch {
      // A cancelled share throws; fall through to copying rather than nagging.
    }
    void copyLink();
  }, [composeCard, copyLink, title, url]);

  const download = useCallback(async () => {
    const blob = await composeCard();
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick so the download has already started.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }, [composeCard, title]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Sits on top of the poster, so it needs its own backdrop rather than the
        // page tokens, which assume the dark card behind them.
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/25 bg-black/45 px-4 text-sm font-medium text-white backdrop-blur transition-all duration-200 hover:border-brand-400/70 hover:bg-black/65 hover:text-brand-300"
      >
        <Share2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Share
      </button>

      {/*
        Rendered into <body> rather than in place. A `transform`, `filter` or
        `backdrop-filter` on any ancestor makes it the containing block for
        `position: fixed` descendants, which pinned this sheet inside the poster
        card instead of over the page. The filter that caused it has since gone,
        but the trigger sits inside cards that carry hover transforms, so the
        portal is what keeps the sheet independent of wherever it is used.
      */}
      {open && mounted
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Share ${title}`}
          // Above the sticky header and the bottom nav, both of which sit at z-40.
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            // Backdrop only — a click inside the card must not close it.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          {/* Pinned to the corner of the screen, not the card, so it is in the
              same place whatever the sheet's height. */}
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="fixed right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/25"
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>

          <div className="my-auto w-full max-w-sm space-y-3 py-14 sm:py-0">
            {/* Pinned white: a QR needs the contrast whatever the theme does. */}
            <div style={{ backgroundColor: "#ffffff" }} className="rounded-3xl p-6 text-center shadow-2xl">
              {/* The QR shrinks on short screens so the actions below stay
                  reachable without scrolling. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`QR code linking to ${title}`}
                className="mx-auto block h-auto w-full max-w-[min(15rem,45vh)]"
              />
              <p className="mt-4 truncate text-lg font-bold uppercase tracking-tight text-[#0f172a]">
                {title}
              </p>
              {venue ? <p className="mt-1 truncate text-sm text-[#64748b]">{venue}</p> : null}
            </div>

            <div
              style={{ backgroundColor: "#ffffff" }}
              className="flex items-center justify-around rounded-3xl px-4 py-5 shadow-2xl"
            >
              <Action icon={Share2} label="Share event" onClick={() => void share()} />
              <Action
                icon={copied ? Check : Link2}
                label={copied ? "Copied" : "Copy link"}
                onClick={() => void copyLink()}
                active={copied}
              />
              <Action icon={Download} label="Download" onClick={() => void download()} />
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Share2;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-24 flex-col items-center gap-2">
      <span
        className={cx(
          "flex h-14 w-14 items-center justify-center rounded-full border transition-colors",
          active ? "border-[#0f172a] bg-[#0f172a] text-white" : "border-[#e2e8f0] text-[#0f172a]",
        )}
      >
        <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="text-xs font-medium text-[#0f172a]">{label}</span>
    </button>
  );
}
