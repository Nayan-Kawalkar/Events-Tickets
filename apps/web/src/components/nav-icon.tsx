"use client";

import {
  CalendarDays,
  CircleHelp,
  House,
  IndianRupee,
  LayoutDashboard,
  Menu,
  Plus,
  ScanLine,
  Settings,
  Shield,
  Ticket,
  User,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/nav";

/** Icon-name → Lucide component. Keeps nav config free of JSX imports. */
const ICONS: Record<IconName, LucideIcon> = {
  home: House,
  ticket: Ticket,
  plus: Plus,
  user: User,
  menu: Menu,
  settings: Settings,
  help: CircleHelp,
  dashboard: LayoutDashboard,
  calendar: CalendarDays,
  scan: ScanLine,
  shield: Shield,
  rupee: IndianRupee,
};

export function NavIcon({
  name,
  className = "h-5 w-5",
  strokeWidth = 1.75,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = ICONS[name];
  // Decorative: every icon in this app sits next to a visible text label.
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
