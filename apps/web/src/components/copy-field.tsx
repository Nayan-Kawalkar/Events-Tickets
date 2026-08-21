"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Copy-to-clipboard row: the most reliable way to pay a personal VPA. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs HTTPS and permission; fall back to selection.
      const input = document.createElement("input");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-eyebrow">{label}</p>
        <p className="text-code mt-0.5 truncate text-slate-900">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-white/12 px-3 text-xs font-medium text-slate-800 transition-colors hover:border-brand-500/60 hover:bg-brand-500/10 hover:text-brand-300"
      >
        {copied ? (
          <Check className="h-4 w-4 text-brand-400" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
