"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

/** The soft fade at an edge, px. */
const FADE = 24;

/** Smooth scrolling unless the visitor asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * A strip that scrolls sideways (a swipe, a trackpad, the keyboard when focused): no scrollbar, and a soft fade at an
 * edge only when there is more content that way. `startAt` gives the scroll position to open at: applied once per `startKey`,
 * as soon as the strip really has a width (a step that opens later, a card that mounts closed, has none at first), never
 * while the visitor is scrolling. The caller owns the scroller's ref (for scrolling it itself).
 */
export function ScrollStrip({
  scrollerRef,
  className = "",
  startAt,
  startKey = "",
  children,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  className?: string;
  startAt?: (el: HTMLDivElement) => number;
  /** Open at `startAt` again when this changes (the day, for the trip track). */
  startKey?: string;
  children: ReactNode;
}) {
  const [fade, setFade] = useState({ left: false, right: false });
  const latest = useRef(startAt);
  const applied = useRef<string | null>(null);
  useEffect(() => {
    latest.current = startAt;
  });
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sync = () => {
      const next = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 };
      setFade((f) => (f.left === next.left && f.right === next.right ? f : next));
    };
    // Once per key, at the first moment there is something to scroll: instant, so it is never an animation.
    const open = () => {
      if (applied.current === startKey || !latest.current || el.clientWidth === 0 || el.scrollWidth <= el.clientWidth) return;
      applied.current = startKey;
      el.scrollTo({ left: Math.max(0, Math.min(latest.current(el), el.scrollWidth - el.clientWidth)), behavior: "instant" });
    };
    open();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(() => {
      open();
      sync();
    });
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [scrollerRef, startKey]);
  const mask = `linear-gradient(to right, ${fade.left ? "transparent" : "black"} 0, black ${FADE}px, black calc(100% - ${FADE}px), ${fade.right ? "transparent" : "black"} 100%)`;
  return (
    <div
      ref={scrollerRef}
      className={`touch-pan-x touch-pan-y overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {children}
    </div>
  );
}
