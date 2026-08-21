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
  // The db package ships TypeScript source that Next compiles for us.
  transpilePackages: ["@ct/db"],
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
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
