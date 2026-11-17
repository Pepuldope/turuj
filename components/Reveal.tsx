"use client";

import { useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";

/** How long a reveal takes to open and to close (the `.reveal` rules in app/globals.css use the same numbers). */
export const REVEAL_OPEN_MS = 320;
export const REVEAL_CLOSE_MS = 220;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Rolls its content out and back: the height glides with the grid-rows trick (0fr to 1fr) and the content
 * fades in a beat after the height starts (Peter, 17 Nov: "show more" rows and sections popped in).
 * While `open` is false the content is not in the page: it is unmounted once the closing has finished, so
 * the hidden rows cost nothing and cannot take focus. `keepMounted` is for content that must stay in the
 * HTML for search engines and no-script readers (the nearby trips): it stays, hidden and `inert`.
 * `appear` rolls the content out when it first shows up; without it, content that starts open is just there.
 * `animate={false}` changes the state without any motion (the first state after hydration).
 */
export function Reveal({
  open,
  as: Tag = "div",
  className,
  appear = false,
  keepMounted = false,
  animate = true,
  children,
}: {
  open: boolean;
  as?: ElementType;
  className?: string;
  appear?: boolean;
  keepMounted?: boolean;
  animate?: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open && !appear);
  // Settled: fully open, so the clip is lifted and focus rings and shadows at the edge are not cut off.
  const [settled, setSettled] = useState(open && !appear);
  useEffect(() => {
    const still = !animate || reduced();
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      if (still) {
        setExpanded(true);
        setSettled(true);
        return;
      }
      // Two frames: the closed state has to be painted once, or there is nothing to animate from.
      let frame2 = 0;
      const frame = requestAnimationFrame(() => (frame2 = requestAnimationFrame(() => setExpanded(true))));
      const done = setTimeout(() => setSettled(true), REVEAL_OPEN_MS + 40);
      return () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(frame2);
        clearTimeout(done);
      };
    }
    setSettled(false);
    setExpanded(false);
    if (still) {
      setMounted(false);
      return;
    }
    const later = setTimeout(() => setMounted(false), REVEAL_CLOSE_MS);
    return () => clearTimeout(later);
  }, [open, animate]);
  if (!mounted && !keepMounted) return null;
  const hidden = keepMounted && !expanded;
  return (
    <Tag className={`reveal ${className ?? ""}`} data-open={expanded} data-settled={settled} data-still={animate ? undefined : true}>
      <div className="reveal-clip">
        <div className="reveal-body" inert={hidden} aria-hidden={hidden || undefined}>
          {children}
        </div>
      </div>
    </Tag>
  );
}
