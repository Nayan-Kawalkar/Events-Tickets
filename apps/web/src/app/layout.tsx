import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { BottomNav } from "@/components/site-nav";
import { ToastProvider } from "@/components/toast";
import { getCurrentUser } from "@/lib/auth";

// Self-hosted at build time by next/font — no third-party request at runtime.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

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
  themeColor: "#041413",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <ToastProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:font-medium focus:text-[#04231c]"
          >
            Skip to content
          </a>

          <SiteHeader user={user} />

          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:py-10 md:pb-10">
            {children}
          </main>

          <SiteFooter />
          <BottomNav
            user={user ? { fullName: user.fullName, email: user.email, role: user.role } : null}
          />
        </ToastProvider>
      </body>
    </html>
  );
}
