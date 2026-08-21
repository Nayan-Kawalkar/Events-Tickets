import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Help" };

const faqs = [
  {
    q: "How do I get my ticket?",
    a: "Register for an event, and the ticket appears under My Tickets. Free tickets are issued immediately; UPI payments are issued once the organizer verifies the payment.",
  },
  {
    q: "My payment is still pending.",
    a: "An organizer checks each UPI payment against their own bank app before issuing a ticket. You will get an email either way. Do not pay twice.",
  },
  {
    q: "Can I use a screenshot of my QR code?",
    a: "A ticket admits one person, once. Whoever reaches the gate first uses it, so do not share your QR with anyone.",
  },
  {
    q: "I lost access to my phone.",
    a: "Contact the event organizer with your college ID. They can block the old ticket and issue a replacement.",
  },
  {
    q: "The gate says my ticket was already used.",
    a: "Go to the help desk. Staff can check the scan log to see when and where it was checked in.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Help Center" description="Common questions about tickets and entry." />

      <div className="space-y-3">
        {faqs.map((faq) => (
          <Card key={faq.q}>
            <h2 className="font-medium text-slate-900">{faq.q}</h2>
            <p className="mt-1.5 text-sm text-slate-600">{faq.a}</p>
          </Card>
        ))}
      </div>

      <section id="contact" className="mt-10 scroll-mt-24">
        <h2 className="mb-3 font-display text-xl font-normal text-slate-900">Contact</h2>
        <Card>
          <p className="text-sm text-slate-600">
            Email the event committee at{" "}
            <a
              href="mailto:events@example.edu"
              className="font-medium text-brand-400 underline-offset-2 hover:underline"
            >
              events@example.edu
            </a>
            , or find the help desk near the entry gate on event day.
          </p>
        </Card>
      </section>

      <section id="terms" className="mt-10 scroll-mt-24">
        <h2 className="mb-3 font-display text-xl font-normal text-slate-900">Terms &amp; Privacy</h2>
        <Card>
          <p className="text-sm text-slate-600">
            We collect only what registration and entry require: your name, email, and roll number
            where an event is student-only. Attendee lists are visible to that event&apos;s
            organizers only. QR codes contain no personal data.
          </p>
        </Card>
      </section>
    </div>
  );
}
