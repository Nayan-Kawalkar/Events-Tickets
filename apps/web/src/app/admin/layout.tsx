import { Role } from "@ct/db";
import { requireRole } from "@/lib/auth";
import { AdminTabs } from "@/components/admin-tabs";

/**
 * Guards every /admin route. The API routes repeat the check independently —
 * hiding the UI is never the boundary.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole([Role.ADMIN], "/admin");

  return (
    <div>
      <AdminTabs />
      {children}
    </div>
  );
}
