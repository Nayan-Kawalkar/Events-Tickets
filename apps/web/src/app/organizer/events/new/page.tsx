import type { Metadata } from "next";
import { EventForm, emptyEvent } from "@/components/event-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Create event" };

export default function NewEventPage() {
  return (
    <>
      <PageHeader
        title="Create event"
        description="Save as a draft first — publish once ticket types are ready."
      />
      <EventForm initial={emptyEvent} />
    </>
  );
}
