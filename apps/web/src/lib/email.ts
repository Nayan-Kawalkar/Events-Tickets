import "server-only";
import { env } from "./env";

/**
 * Email delivery.
 *
 * With no provider configured the message is written to the server log, which is
 * enough for development and for the pilot's console-only mode. Set
 * EMAIL_PROVIDER_API_KEY to switch to Resend without touching call sites.
 */

type Mail = {
  to: string;
  subject: string;
  text: string;
};

async function sendViaResend(mail: Mail, apiKey: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "College Events <onboarding@resend.dev>",
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
  }
}

/**
 * Never throws. A ticket is already issued by the time we send confirmation, so
 * a mail failure must be logged rather than fail the registration.
 */
export async function sendMail(mail: Mail) {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;

  try {
    if (apiKey) {
      await sendViaResend(mail, apiKey);
      return;
    }

    console.info(
      ["", "─── EMAIL (console transport) ───", `To:      ${mail.to}`, `Subject: ${mail.subject}`, "", mail.text, "─────────────────────────────────", ""].join(
        "\n",
      ),
    );
  } catch (err) {
    console.error("[email] delivery failed", { to: mail.to, subject: mail.subject, err });
  }
}

export function ticketConfirmationEmail(params: {
  to: string;
  attendeeName: string;
  eventTitle: string;
  eventVenue: string | null;
  eventStartsAt: Date;
  ticketTypeName: string;
  publicId: string;
}): Mail {
  const ticketUrl = `${env.APP_URL}/tickets/${params.publicId}`;

  return {
    to: params.to,
    subject: `Your ticket for ${params.eventTitle}`,
    text: [
      `Hi ${params.attendeeName},`,
      "",
      `Your registration for ${params.eventTitle} is confirmed.`,
      "",
      `Ticket type: ${params.ticketTypeName}`,
      `When:        ${params.eventStartsAt.toLocaleString("en-IN")}`,
      `Where:       ${params.eventVenue ?? "To be announced"}`,
      `Ticket ID:   ${params.publicId}`,
      "",
      `View your ticket: ${ticketUrl}`,
      "",
      "Open the ticket page before you reach the gate, and carry your college ID.",
      "This ticket admits one person and can be used only once.",
    ].join("\n"),
  };
}

export function paymentReceivedEmail(params: { to: string; attendeeName: string }): Mail {
  return {
    to: params.to,
    subject: "We received your payment details",
    text: [
      `Hi ${params.attendeeName},`,
      "",
      "Thanks — your payment details are with the organizer for verification.",
      "You will get a second email with your ticket once the payment is confirmed.",
      "",
      "No ticket has been issued yet. Please do not pay again.",
    ].join("\n"),
  };
}

export function paymentRejectedEmail(params: {
  to: string;
  attendeeName: string;
  eventTitle: string;
  ticketTypeName: string;
  reason: string;
}): Mail {
  return {
    to: params.to,
    subject: `Payment not verified for ${params.eventTitle}`,
    text: [
      `Hi ${params.attendeeName},`,
      "",
      `The organizer could not verify your payment for ${params.eventTitle} (${params.ticketTypeName}).`,
      "",
      `Reason: ${params.reason}`,
      "",
      "No ticket has been issued. If you believe your payment went through, reply to this",
      "email or contact the organizer with your UPI reference number.",
    ].join("\n"),
  };
}
