/**
 * UPI payment addressing.
 *
 * A `upi://pay` URI works reliably when it is *scanned as a QR by the UPI app
 * itself*. The same URI opened as a link from a browser is treated as an
 * untrusted intent, and PSP apps (GPay, PhonePe, Paytm) reject it for personal
 * VPAs — surfacing as "permission denied" or a bogus "limit exceeded". So the
 * QR is the primary path here and the deep link is only ever a fallback.
 */
export function buildUpiUri(params: {
  payeeVpa: string;
  payeeName?: string | null;
  amountPaise: number;
  note?: string | null;
  /** Transaction reference, echoed back by the app in the receipt. */
  reference?: string | null;
}) {
  // Percent-encode, but keep "@" literal in the payee address: real UPI QR
  // codes carry `pa=name@bank`, and some apps fail to parse the %40 form.
  const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, "%20");

  const parts = [
    `pa=${encode(params.payeeVpa).replace(/%40/g, "@")}`,
    params.payeeName ? `pn=${encode(params.payeeName)}` : null,
    `am=${(params.amountPaise / 100).toFixed(2)}`,
    "cu=INR",
    params.note ? `tn=${encode(params.note.slice(0, 50))}` : null,
    params.reference ? `tr=${encode(params.reference.slice(0, 35))}` : null,
  ].filter(Boolean);

  return `upi://pay?${parts.join("&")}`;
}

/** Basic shape check: name@handle. */
export function isLikelyVpa(value: string) {
  return /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/.test(value.trim());
}
