"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cx } from "./ui";

type Toast = { id: number; tone: "success" | "error"; message: string };

const ToastContext = createContext<{ push: (tone: Toast["tone"], message: string) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Announced to screen readers as well as shown visually. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "pointer-events-auto w-full max-w-md rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur-md animate-rise",
              toast.tone === "success"
                ? "border-brand-500/40 bg-[#0b2a27]/95 text-brand-200 shadow-brand-500/10"
                : "border-red-400/40 bg-[#2a0f0f]/95 text-red-200 shadow-red-500/10",
            )}
          >
            <span className="font-medium">{toast.tone === "success" ? "Success: " : "Error: "}</span>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
