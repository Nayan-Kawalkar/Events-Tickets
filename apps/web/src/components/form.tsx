"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "./ui";

const controlBase =
  "w-full min-h-11 rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-sm text-slate-900 transition-colors duration-200 placeholder:text-slate-500 hover:border-white/20 focus:border-brand-500 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-600";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="ml-0.5 text-red-400" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  error,
  className,
  ...props
}: React.ComponentProps<"input"> & { error?: string }) {
  return (
    <input
      {...props}
      aria-invalid={error ? true : undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      className={cx(controlBase, error && "border-red-400/70 focus:ring-red-400/25", className)}
    />
  );
}

/**
 * Password field with a reveal toggle.
 *
 * Typing a password blind is where most sign-in failures actually come from, so
 * the eye is worth the small exposure — it starts hidden and the caller decides
 * nothing.
 *
 * The toggle is a real button with `type="button"`: inside a form, a bare
 * button submits, which would post the form every time someone peeked.
 */
export function PasswordInput({
  error,
  className,
  ...props
}: React.ComponentProps<"input"> & { error?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error && props.id ? `${props.id}-error` : undefined}
        className={cx(controlBase, "pr-11", error && "border-red-400/70 focus:ring-red-400/25", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // The label carries the state, so a screen reader announces what the
        // button will do rather than just "button".
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function TextArea({
  error,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { error?: string }) {
  return (
    <textarea
      {...props}
      aria-invalid={error ? true : undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      className={cx(controlBase, "min-h-24", error && "border-red-400/70 focus:ring-red-400/25", className)}
    />
  );
}

export function Select({
  error,
  className,
  ...props
}: React.ComponentProps<"select"> & { error?: string }) {
  return (
    <select
      {...props}
      aria-invalid={error ? true : undefined}
      className={cx(
        controlBase,
        "cursor-pointer [&>option]:bg-[#0b2a27] [&>option]:text-[#e3f2ef]",
        error && "border-red-400/70 focus:ring-red-400/25",
        className,
      )}
    />
  );
}

export function Checkbox({
  label,
  hint,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg py-2 text-sm text-slate-800 transition-colors hover:text-slate-900">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-5 w-5 cursor-pointer rounded border-white/20 bg-white/5 text-brand-500 accent-[#2bdca3] transition-colors focus:ring-brand-500/40"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}
