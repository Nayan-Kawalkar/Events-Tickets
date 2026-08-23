import { cx } from "./ui";

/**
 * A host's picture, or their initials when there isn't one.
 *
 * The picture is optional and most hosts will not have one, so the fallback is
 * the common case rather than an error state — a blank grey circle would make
 * every list look broken.
 *
 * No hooks, so this renders in a server component and in the client-side
 * editor without a second copy.
 */
export function HostAvatar({
  name,
  uploadId,
  className,
}: {
  name: string;
  uploadId: string | null;
  className?: string;
}) {
  const shape = cx(
    "h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-white/12",
    className,
  );

  if (uploadId) {
    return (
      // Decorative: the name is always printed next to it, so announcing it
      // again would just repeat the same words to a screen reader.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/uploads/${uploadId}`}
        alt=""
        loading="lazy"
        className={cx(shape, "object-cover")}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cx(shape, "flex items-center justify-center bg-white/8 text-sm font-medium text-slate-300")}
    >
      {initials(name)}
    </span>
  );
}

/** First letters of the first and last words — "Asha R Kumar" gives "AK". */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}
