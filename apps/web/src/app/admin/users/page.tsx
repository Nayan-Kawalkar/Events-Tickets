import type { Metadata } from "next";
import { prisma, Role } from "@ct/db";
import { CreateUserForm, UserRow, type AdminUserRow } from "@/components/admin-users";
import { Alert, EmptyState, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Users · Admin" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; role?: string }> };

export default async function AdminUsersPage({ searchParams }: Props) {
  const [admin, sp] = await Promise.all([requireRole([Role.ADMIN]), searchParams]);

  const q = sp.q?.trim() ?? "";
  const roleFilter =
    sp.role && (Object.values(Role) as string[]).includes(sp.role) ? (sp.role as Role) : undefined;

  const users = await prisma.user.findMany({
    where: {
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { rollNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      department: true,
      _count: { select: { tickets: true, createdEvents: true } },
    },
  });

  const rows: AdminUserRow[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    department: user.department,
    counts: { tickets: user._count.tickets, events: user._count.createdEvents },
    isSelf: user.id === admin.id,
  }));

  const filters = [
    { label: "All", value: "" },
    { label: "Admins", value: Role.ADMIN },
    { label: "Organizers", value: Role.ORGANIZER },
    { label: "Students", value: Role.STUDENT },
  ];

  return (
    <>
      <PageHeader title="Users" description="Roles, access and staff accounts." />

      <div className="mb-6">
        <Alert tone="info">
          Anyone signing up publicly becomes a <strong>student</strong>. Organizer and admin
          accounts can only be created here — an organizer can read every attendee&apos;s contact
          details for their events.
        </Alert>
      </div>

      <div className="mb-6">
        <CreateUserForm />
      </div>

      <form method="get" className="mb-5 flex flex-wrap gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search users
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Search name, email or roll number"
          className="min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-sm text-slate-900 placeholder:text-slate-500 sm:max-w-md"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-lg border border-white/12 bg-white/[0.03] px-4 text-sm font-medium text-slate-800 transition-colors hover:border-brand-500/60 hover:text-brand-300"
        >
          Search
        </button>
      </form>

      <nav aria-label="Filter by role" className="mb-5 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = (roleFilter ?? "") === filter.value;
          const href = filter.value ? `/admin/users?role=${filter.value}` : "/admin/users";
          return (
            <a
              key={filter.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-full border border-brand-500 bg-brand-500 px-3 py-1.5 text-sm font-medium text-[#04231c]"
                  : "rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-brand-500/50 hover:text-brand-300"
              }
            >
              {filter.label}
            </a>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title="No users match" description="Try a different search or filter." />
      ) : (
        <ul className="space-y-3">
          {rows.map((user) => (
            <li key={user.id}>
              <UserRow user={user} />
            </li>
          ))}
        </ul>
      )}

      {rows.length === 200 ? (
        <p className="mt-3 text-sm text-slate-500">Showing the first 200 users. Use search to narrow.</p>
      ) : null}
    </>
  );
}
