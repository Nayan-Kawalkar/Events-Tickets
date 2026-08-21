"use client";

import { useCallback, useRef, type ReactNode } from "react";

/**
 * Card surface with a cursor-tracking glow.
 *
 * The pointer position is written straight to CSS custom properties rather than
 * React state, so moving the mouse never triggers a re-render. Touch devices
 * never fire pointermove without contact, so they simply get the static card.
 */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const node = ref.current;
    if (!node) return;

    // Also latch the glow on here, not only on enter: if the cursor is already
    // inside the card when it mounts (common after a client-side navigation),
    // no enter event ever fires. Written synchronously so it never waits on a
    // frame that a backgrounded tab will not schedule.
    node.style.setProperty("--glow-opacity", "1");

    // Coalesce position writes to one per animation frame.
    if (frame.current !== null) return;
    const { clientX, clientY } = event;

    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const rect = node.getBoundingClientRect();
      node.style.setProperty("--mouse-x", `${clientX - rect.left}px`);
      node.style.setProperty("--mouse-y", `${clientY - rect.top}px`);
    });
  }, []);

  const onPointerEnter = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    ref.current?.style.setProperty("--glow-opacity", "1");
  }, []);

  const onPointerLeave = useCallback(() => {
    ref.current?.style.setProperty("--glow-opacity", "0");
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={`spotlight ${className}`}
    >
      {children}
    </div>
  );
}
