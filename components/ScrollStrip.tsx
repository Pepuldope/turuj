"use client";

import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";

/** The soft fade at an edge, px. */
const FADE = 24;

/** Smooth scrolling unless the visitor asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * A strip that scrolls sideways (a swipe, a trackpad, the keyboard when focused): no scrollbar, and a soft fade at an
 * edge only when there is more content that way. `startAt` gives the first scroll position, once, when it appears.
 * The caller owns the scroller's ref (for scrolling it itself).
 */
export function ScrollStrip({
  scrollerRef,
  className = "",
  startAt,
  children,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  className?: string;
  startAt?: (el: HTMLDivElement) => number;
  children: ReactNode;
}) {
  const [fade, setFade] = useState({ left: false, right: false });
  const [start] = useState(() => startAt);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const sync = () => {
      const next = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 };
      setFade((f) => (f.left === next.left && f.right === next.right ? f : next));
    };
    if (start) el.scrollLeft = Math.max(0, Math.min(start(el), el.scrollWidth - el.clientWidth));
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [scrollerRef, start]);
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
