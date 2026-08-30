/*
 * Service worker — present so the app is installable, and deliberately almost
 * inert beyond that.
 *
 * This is a ticketing app. A cached page can show a ticket that has since been
 * cancelled, a QR that has already been used, or a gate list that is out of
 * date, and at a door that is worse than showing nothing. So nothing dynamic is
 * cached here: no HTML, no API responses, no images that belong to a person.
 *
 * The one exception is Next's build output under /_next/static. Those files are
 * content-hashed — a new build produces new filenames — so serving them from
 * the cache can never return a stale version of anything.
 */

const CACHE = "campuspass-static-v1";

self.addEventListener("install", (event) => {
  // Take over straight away rather than waiting for every tab to close.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of this worker.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch plain GETs from this origin.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Everything that can change — pages, APIs, uploads — goes straight to the
  // network, exactly as it would without a service worker.
  if (!url.pathname.startsWith("/_next/static/")) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      // Only store a complete, successful response; a partial or error response
      // in the cache would break the app until the cache is cleared.
      if (response.ok && response.status === 200) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
