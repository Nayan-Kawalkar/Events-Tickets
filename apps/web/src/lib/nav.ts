import { Role } from "./enums";

/** Icon names available to navigation. Keeps this config free of JSX. */
export type IconName =
  | "home"
  | "ticket"
  | "plus"
  | "user"
  | "menu"
  | "settings"
  | "help"
  | "dashboard"
  | "calendar"
  | "scan"
  | "shield"
  | "rupee";

/**
 * Single source of truth for navigation.
 *
 * The desktop bar, the mobile drawer and the mobile bottom bar all read from
 * here, so a route is never listed in one place and forgotten in another.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Lucide icon name, resolved to a component in the nav components. */
  icon: IconName;
  /** Who may see it. Undefined means everyone, including signed-out visitors. */
  roles?: Role[];
  /** Requires a signed-in user of any role. */
  authOnly?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Events", icon: "home" },
  { href: "/tickets", label: "My Tickets", icon: "ticket", authOnly: true },
  { href: "/organizer", label: "For Organizers", icon: "plus", roles: [Role.ORGANIZER, Role.ADMIN] },
  { href: "/scanner", label: "Scanner", icon: "scan", roles: [Role.SCANNER, Role.ORGANIZER, Role.ADMIN] },
  { href: "/admin", label: "Admin", icon: "shield", roles: [Role.ADMIN] },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: "/profile", label: "Profile", icon: "user", authOnly: true },
  { href: "/payments", label: "Payments", icon: "rupee", authOnly: true },
  { href: "/settings", label: "Settings", icon: "settings", authOnly: true },
  { href: "/help", label: "Help", icon: "help" },
];

export const ORGANIZER_NAV: NavItem[] = [
  { href: "/organizer", label: "Dashboard", icon: "dashboard", roles: [Role.ORGANIZER, Role.ADMIN] },
  { href: "/organizer/events", label: "My Events", icon: "calendar", roles: [Role.ORGANIZER, Role.ADMIN] },
  { href: "/scanner", label: "Scanner", icon: "scan", roles: [Role.SCANNER, Role.ORGANIZER, Role.ADMIN] },
  { href: "/admin", label: "Admin", icon: "shield", roles: [Role.ADMIN] },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Admin", icon: "shield", roles: [Role.ADMIN] },
];

export function visibleTo(items: NavItem[], role: Role | null): NavItem[] {
  return items.filter((item) => {
    if (item.roles) return role !== null && item.roles.includes(role);
    if (item.authOnly) return role !== null;
    return true;
  });
}

/**
 * Active-state matching. "/" only matches exactly, so it does not light up on
 * every page; everything else matches its own subtree.
 */
/** Drop items already shown elsewhere, so no link appears twice in one menu. */
export function excluding(items: NavItem[], shown: NavItem[]): NavItem[] {
  const seen = new Set(shown.map((item) => item.href));
  return items.filter((item) => !seen.has(item.href));
}

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Page title for the mobile header, derived from the path. */
export function titleForPath(pathname: string): string {
  const titles: [RegExp, string][] = [
    [/^\/$/, "Events"],
    [/^\/events\/[^/]+\/pay/, "Payment"],
    [/^\/events\//, "Event"],
    [/^\/tickets\/[^/]+$/, "Your Ticket"],
    [/^\/tickets$/, "My Tickets"],
    [/^\/payments$/, "Payments"],
    [/^\/profile$/, "Profile"],
    [/^\/settings$/, "Settings"],
    [/^\/help$/, "Help"],
    [/^\/dashboard$/, "Dashboard"],
    [/^\/organizer\/events\/[^/]+\/attendees/, "Attendees"],
    [/^\/organizer\/events\/[^/]+\/manual-payments/, "Payments"],
    [/^\/organizer\/events\/[^/]+\/edit/, "Edit Event"],
    [/^\/organizer\/events\/(new|create)/, "Create Event"],
    [/^\/organizer\/events/, "My Events"],
    [/^\/organizer/, "Organizer"],
    [/^\/scanner/, "Scanner"],
    [/^\/admin/, "Admin"],
    [/^\/login$/, "Sign in"],
    [/^\/register$/, "Create account"],
  ];

  for (const [pattern, title] of titles) {
    if (pattern.test(pathname)) return title;
  }
  return "College Events";
}

/**
 * Where to send someone once they have signed in.
 *
 * The page they were trying to reach when they got bounced to the sign-in
 * screen, or the home page when they simply chose to sign in. Never a
 * dashboard by default: most people here are students who want an event, not
 * an admin panel.
 *
 * Only same-site paths are honoured. An absolute URL, or the protocol-relative
 * `//evil.test` form, would turn sign-in into an open redirect.
 */
export function safeNext(value: string | null | undefined, fallback = "/") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  // Pointing back at an auth page would loop: an authenticated visitor
  // landing on /login is sent straight back to /login.
  const path = value.split("?")[0];
  if (path === "/login" || path === "/register" || path === "/logout") return fallback;
  return value;
}
