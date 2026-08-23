"use client";

import { useState } from "react";
import { useToast } from "./toast";

/** Uploads an image and hands back the stored upload id. */
export function ImageUpload({
  kind,
  uploadId,
  onUploaded,
  label,
  hint,
  previewClassName = "aspect-video w-full max-w-sm",
}: {
  kind: "EVENT_POSTER" | "UPI_QR" | "HOST_AVATAR";
  uploadId: string;
  onUploaded: (uploadId: string) => void;
  label: string;
  hint?: string;
  previewClassName?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { Accept: "application/json" },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { uploadId?: string; message?: string };

      if (!res.ok || !data.uploadId) {
        toast.push("error", data.message ?? "Could not upload that image.");
        return;
      }

      onUploaded(data.uploadId);
      toast.push("success", "Image uploaded. Save to apply it.");
    } catch {
      toast.push("error", "Network error while uploading.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>

      {uploadId ? (
        <div className={`relative mb-2 overflow-hidden rounded-lg ring-1 ring-white/10 ${previewClassName}`}>
          {/* Plain img: this is a local preview that changes as the user picks files. */}
          <img
            src={`/api/uploads/${uploadId}`}
            alt="Current upload preview"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onUploaded("")}
            className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white transition-colors hover:bg-red-500/80"
          >
            Remove
          </button>
        </div>
      ) : null}

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
        className="w-full rounded-lg border border-white/12 bg-white/[0.03] p-2 text-sm text-slate-800 transition-colors hover:border-white/20 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-500/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-300 hover:file:bg-brand-500/25"
      />
      <p className="mt-1.5 text-xs text-slate-500">
        {busy ? "Uploading…" : (hint ?? "JPG, PNG or WebP, up to 5 MB.")}
      </p>
    </div>
  );
}
