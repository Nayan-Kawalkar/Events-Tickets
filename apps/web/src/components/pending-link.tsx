"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

/**
 * A link that shows it was clicked.
 *
 * Navigation to a data-backed page costs a server round-trip. Without this the
 * button looks inert for that whole time and people click again. `useLinkStatus`
 * reports the pending state of the enclosing Link, so the feedback is immediate
 * and needs no state of our own.
 */
function Spinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

export function PendingLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <Spinner />
    </Link>
  );
}
