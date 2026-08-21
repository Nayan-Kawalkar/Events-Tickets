import "server-only";
import QRCode from "qrcode";

/**
 * Server-rendered QR. The payload never touches the client as data the page
 * could leak elsewhere — it is baked into an inline SVG.
 */
export async function TicketQr({ payload, dimmed = false }: { payload: string; dimmed?: boolean }) {
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    // Rendered at full container width; the viewBox scales cleanly.
    width: 512,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return (
    <div
      className={`mx-auto w-full max-w-xs rounded-xl bg-white p-3 ring-1 ring-slate-200 ${
        dimmed ? "opacity-40 grayscale" : ""
      }`}
      // qrcode emits a self-contained <svg>; the payload is signed text we produced.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
