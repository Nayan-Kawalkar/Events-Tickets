import Image from "next/image";
import { cx } from "./ui";

/** Deterministic gradient so an event without a poster still looks designed. */
const GRADIENTS = [
  "from-[#0f3b34] via-[#0b2a27] to-[#061715]",
  "from-[#123a44] via-[#0b2a2f] to-[#06171a]",
  "from-[#1a3327] via-[#0d251c] to-[#061513]",
  "from-[#2a2f4a] via-[#181c30] to-[#0b0d18]",
];

function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

/**
 * Event poster with a graceful fallback.
 *
 * `ratio` matches the surface: wide for cards and heroes, tall for the
 * poster-style detail panel. The fallback keeps the same box so a mixed grid
 * never goes ragged.
 */
export function Poster({
  uploadId,
  title,
  ratio = "video",
  className,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px",
}: {
  uploadId: string | null;
  title: string;
  ratio?: "video" | "poster" | "wide";
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const ratios = {
    video: "aspect-video",
    poster: "aspect-[3/4]",
    wide: "aspect-[21/9]",
  } as const;

  const shell = cx("relative overflow-hidden rounded-lg bg-black/30", ratios[ratio], className);

  if (!uploadId) {
    return (
      <div className={cx(shell, "bg-gradient-to-br", gradientFor(title))} aria-hidden="true">
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <span className="font-display text-center text-lg text-white/25">{title}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <Image
        src={`/api/uploads/${uploadId}`}
        alt={`Poster for ${title}`}
        fill
        sizes={sizes}
        priority={priority}
        className="media-reveal object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      {/* Keeps overlaid text legible whatever the poster looks like. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />
    </div>
  );
}
