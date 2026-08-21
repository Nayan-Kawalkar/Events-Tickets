import { Role } from "@ct/db";
import { requireRole } from "@/lib/auth";

/**
 * Guards every /organizer route. Students are redirected before any organizer
 * page renders; the API routes repeat the check independently.
 */
export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  await requireRole([Role.ORGANIZER, Role.ADMIN], "/organizer/events");
  return <>{children}</>;
}
