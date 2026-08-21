import "server-only";
import QRCode from "qrcode";

/**
 * UPI payment card: payee name above the QR, UPI ID below.
 *
 * Generated from the organizer's VPA with the exact amount baked in, so the
 * amount is always right and organizers need not upload their own QR (which
 * usually has no amount, inviting underpayment).
 */
export async function UpiQr({
  uri,
  amountLabel,
  payeeName,
  vpa,
}: {
  uri: string;
  amountLabel: string;
  payeeName?: string | null;
  vpa: string;
}) {
  const svg = await QRCode.toString(uri, {
    type: "svg",
    errorCorrectionLevel: "M",
    // Quiet zone in modules. Scanners need clear space around the code;
    // the white plate alone is not wide enough to guarantee it.
    margin: 2,
    width: 512,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return (
    <figure className="mx-auto flex w-full max-w-[17rem] flex-col items-center">
      <div
        // Pinned white: UPI scanners need the contrast, whatever the theme does.
        style={{ backgroundColor: "#ffffff" }}
        className="w-full rounded-2xl px-4 py-4 text-center shadow-[0_0_40px_-12px_rgba(43,220,163,0.35)] ring-1 ring-white/20"
      >
        {payeeName ? (
          <p className="mb-1 truncate text-sm font-semibold text-[#0f172a]">{payeeName}</p>
        ) : null}
        <p className="mb-3 text-xs font-medium text-[#475569]">Pay {amountLabel}</p>

        {/*
          The library emits an <svg> with fixed width/height attributes. Without
          forcing it to block-level, full-width, auto-height it keeps its own
          intrinsic size and sits off-centre inside this box.
        */}
        <div
          className="mx-auto w-full [&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <p className="mt-3 break-all font-mono text-[11px] leading-tight text-[#334155]">{vpa}</p>
      </div>

      <figcaption className="mt-2.5 text-center text-xs text-slate-500">
        Scan with any UPI app
      </figcaption>
    </figure>
  );
}
