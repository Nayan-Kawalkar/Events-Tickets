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
    // Quiet zone in modules. Scanners need clear space around the code;
    // the white plate alone is not wide enough to guarantee it.
    margin: 2,
    // Rendered at full container width; the viewBox scales cleanly.
    width: 512,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return (
    <div
      // The white plate and dark modules are pinned, not themed: scanners need
      // the contrast, and a dark-themed QR reads poorly or not at all.
      style={{ backgroundColor: "#ffffff" }}
      // The emitted <svg> carries its own width/height; forcing block/full-width
      // keeps it centred inside this plate instead of sitting off to one side.
      className={`mx-auto w-full max-w-xs rounded-xl p-3 shadow-[0_0_40px_-10px_rgba(43,220,163,0.35)] ring-1 ring-white/20 transition-opacity [&>svg]:mx-auto [&>svg]:block [&>svg]:h-auto [&>svg]:w-full ${
        dimmed ? "opacity-30 grayscale" : ""
      }`}
      // qrcode emits a self-contained <svg>; the payload is signed text we produced.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
