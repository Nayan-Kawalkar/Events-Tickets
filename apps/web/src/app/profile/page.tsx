import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/profile");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Your profile"
        description="These details appear on your tickets and on the organizer's attendee list."
      />
      <ProfileForm
        initial={{
          email: user.email,
          fullName: user.fullName,
          rollNumber: user.rollNumber ?? "",
          department: user.department ?? "",
        }}
      />
    </div>
  );
}
