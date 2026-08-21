import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toast";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: {
    default: "College Events",
    template: "%s · College Events",
  },
  description: "Register for college events and carry your ticket on your phone.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f49b2",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <ToastProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
          >
            Skip to content
          </a>
          <SiteHeader user={user} />
          <main id="main" className="mx-auto w-full max-w-5xl px-4 py-8">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4 text-xs text-slate-500">
            Bring your college ID to every event. Tickets are personal and single-use.
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
