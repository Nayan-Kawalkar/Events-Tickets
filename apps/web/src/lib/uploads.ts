import "server-only";
import { prisma, UploadKind } from "@ct/db";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Magic-byte signatures. A client-supplied Content-Type is a claim, not a fact;
 * checking the bytes stops an executable or SVG being stored as "image/png"
 * and later served back.
 */
function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP"
  const ascii = (i: number, s: string) =>
    s.split("").every((ch, n) => bytes[i + n] === ch.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  return null;
}

export type UploadFailure = "NO_FILE" | "TOO_LARGE" | "UNSUPPORTED_TYPE";

export type StoreResult =
  | { ok: true; uploadId: string; mimeType: string; sizeBytes: number }
  | { ok: false; reason: UploadFailure };

export const UPLOAD_FAILURE_MESSAGES: Record<UploadFailure, string> = {
  NO_FILE: "Choose an image to upload.",
  TOO_LARGE: "That image is larger than 5 MB. Please upload a smaller screenshot.",
  UNSUPPORTED_TYPE: "Upload a JPG, PNG or WebP image.",
};

/** Validate and persist an uploaded image. */
export async function storeUpload(params: {
  file: unknown;
  kind: UploadKind;
  uploadedById: string;
}): Promise<StoreResult> {
  const { file, kind, uploadedById } = params;

  if (!(file instanceof File) || file.size === 0) return { ok: false, reason: "NO_FILE" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "TOO_LARGE" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Trust the bytes, not the declared type.
  const sniffed = sniffMime(bytes);
  if (!sniffed || !ALLOWED_MIME.has(sniffed)) return { ok: false, reason: "UNSUPPORTED_TYPE" };

  const upload = await prisma.upload.create({
    data: {
      kind,
      mimeType: sniffed,
      sizeBytes: bytes.byteLength,
      data: Buffer.from(bytes),
      uploadedById,
    },
    select: { id: true, mimeType: true, sizeBytes: true },
  });

  return { ok: true, uploadId: upload.id, mimeType: upload.mimeType, sizeBytes: upload.sizeBytes };
}
