import type { MetadataRoute } from "next";

/**
 * Web app manifest — what turns the site into something installable.
 *
 * Served at /manifest.webmanifest and linked automatically by Next.
 *
 * The name here is what appears under the icon on a home screen, so it is
 * deliberately the product name rather than the page title.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CampusPass — College Events",
    short_name: "CampusPass",
    description: "Register for college events and carry your ticket on your phone.",

    // `id` keeps the installed app stable if start_url ever changes; without it
    // a changed start_url can register as a second, separate app.
    id: "/",
    start_url: "/",
    scope: "/",

    // The point of the exercise: no browser chrome, its own window in the task
    // switcher, launched from the home screen like any other app.
    display: "standalone",

    // Matches the site background so the splash screen does not flash white
    // before the first paint.
    background_color: "#041413",
    theme_color: "#041413",
    orientation: "portrait",
    categories: ["events", "education", "productivity"],

    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops to a circle; the maskable copy has the padding for it.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],

    // Long-press the installed icon: the two things people open the app to do.
    shortcuts: [
      {
        name: "My tickets",
        short_name: "Tickets",
        url: "/tickets",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Scan tickets",
        short_name: "Scan",
        url: "/scanner",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
