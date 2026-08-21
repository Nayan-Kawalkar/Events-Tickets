import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

// One .env at the monorepo root, shared with the Prisma CLI. Next only looks in
// the app directory by default, so load the root file explicitly.
try {
  loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // No root .env (e.g. env vars come from the hosting platform) — carry on.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep already-fetched pages in the client router cache, so Back and
    // repeat visits render instantly instead of re-querying the database.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // The db package ships TypeScript source that Next compiles for us.
  transpilePackages: ["@ct/db"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  async redirects() {
    return [
      // Routes moved to the canonical page map; keep old links working.
      { source: "/student/tickets", destination: "/tickets", permanent: true },
      { source: "/student/tickets/:publicId", destination: "/tickets/:publicId", permanent: true },
      { source: "/student/profile", destination: "/profile", permanent: true },
      { source: "/student/payments", destination: "/payments", permanent: true },
      // Names used in the page map that differ from the built routes.
      { source: "/organizer/events/create", destination: "/organizer/events/new", permanent: false },
      {
        source: "/organizer/events/:eventId/manual-payments",
        destination: "/organizer/events/:eventId/payments",
        permanent: false,
      },
      {
        source: "/organizer/events/:eventId/tickets",
        destination: "/organizer/events/:eventId/edit",
        permanent: false,
      },
      // The scanner is one screen; its sub-routes point back at it.
      { source: "/scanner/checkin", destination: "/scanner", permanent: false },
      { source: "/scanner/gates", destination: "/scanner", permanent: false },
      { source: "/scanner/login", destination: "/login?next=/scanner", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
