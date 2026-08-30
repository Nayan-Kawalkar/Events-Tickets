"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the app installable.
 *
 * Renders nothing. Registration is deferred to `load` so it never competes with
 * the first paint, and every failure is swallowed — an unregistered worker
 * costs the install prompt, nothing else, and must not surface as an error to
 * someone trying to buy a ticket.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Registration requires a secure context; on plain http it throws.
    if (!window.isSecureContext) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Nothing to recover: the site works exactly the same without it.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
