import { Role } from "./enums";

/**
 * Single source of truth for navigation.
 *
 * The desktop bar, the mobile drawer and the mobile bottom bar all read from
 * here, so a route is never listed in one place and forgotten in another.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Emoji used by the mobile bottom bar; decorative, always paired with a label. */
  icon: string;
  /** Who may see it. Undefined means everyone, including signed-out visitors. */
  roles?: Role[];
  /** Requires a signed-in user of any role. */
  authOnly?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Events", icon: "🏠" },
  { href: "/tickets", label: "My Tickets", icon: "🎫", authOnly: true },
  { href: "/organizer", label: "For Organizers", icon: "➕", roles: [Role.ORGANIZER, Role.ADMIN] },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: "/profile", label: "Profile", icon: "👤", authOnly: true },
  { href: "/payments", label: "Payments", icon: "₹", authOnly: true },
  { href: "/settings", label: "Settings", icon: "⚙️", authOnly: true },
  { href: "/help", label: "Help", icon: "❓" },
];

export const ORGANIZER_NAV: NavItem[] = [
  { href: "/organizer", label: "Dashboard", icon: "📊", roles: [Role.ORGANIZER, Role.ADMIN] },
  { href: "/organizer/events", label: "My Events", icon: "📅", roles: [Role.ORGANIZER, Role.ADMIN] },
  { href: "/scanner", label: "Scanner", icon: "📷", roles: [Role.ORGANIZER, Role.ADMIN] },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Admin", icon: "🛡️", roles: [Role.ADMIN] },
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
