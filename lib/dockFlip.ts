"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

// The phone's top of screen holds three things: the top bar (slides away while scrolling down), the
// start reminder (when no start is set) and the stuck search row. The bar and the reminder move by
// transform; a stuck row's `top` would have to animate on the main thread and lag behind them
// (Peter, 2026-11-03). So a stuck row jumps to its new `top` at once and is slid there by a transform
// over the same 200 ms, moving together with the bar as one piece.

const EVENT = "turuj-dock";
const MS = 280;
/** Coming into view: a slide with a small overshoot (Peter, 2026-11-03: "a little slide in"). */
export const EASE_IN = "cubic-bezier(0.34, 1.35, 0.64, 1)";
/** Going away: plain and quick. */
export const EASE_OUT = "cubic-bezier(0.4, 0, 0.2, 1)";

function calm() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The easing of the move in progress: the top bar sets it on <html> as it comes or goes. */
function ease() {
  return document.documentElement.dataset.dock === "in" ? EASE_IN : EASE_OUT;
}

/** A small "pop" as a bar appears: from a touch smaller and fainter to a hair bigger, then settles. */
export function pop(el: Element | null | undefined) {
  if (!el || calm() || typeof (el as HTMLElement).animate !== "function") return;
  (el as HTMLElement).animate(
    [
      { transform: "scale(0.94)", opacity: 0.4 },
      { transform: "scale(1.02)", opacity: 1, offset: 0.6 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: 320, easing: "ease-out" },
  );
}

/** Pops a sticky element's content the moment it gets stuck at the top. */
export function useStuckPop(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let stuck = false;
    let raf = 0;
    const check = () => {
      raf = 0;
      const el = ref.current;
      if (!el || getComputedStyle(el).position !== "sticky") return;
      const top = parseFloat(getComputedStyle(el).top) || 0;
      // A row that is stuck sits exactly at its top; the page has to have moved for it to get there.
      const now = Math.abs(el.getBoundingClientRect().top - top) < 1 && window.scrollY > 0;
      if (now && !stuck) pop(el.firstElementChild);
      stuck = now;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}

/** Call right after --topbar or --startbar changed. */
export function dockMoved() {
  window.dispatchEvent(new Event(EVENT));
}

/** Slides a `position: sticky` element to its new top (see above) instead of animating `top`. */
export function useDockFlip(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let last: number | null = null;
    const topOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).top) || 0;
    const onMove = () => {
      const el = ref.current;
      if (!el) return;
      const now = topOf(el);
      const was = last ?? now;
      last = now;
      if (was === now || getComputedStyle(el).position !== "sticky") return;
      // Only a row that is stuck right now moves with the bar; one further down the page stays put.
      if (Math.abs(el.getBoundingClientRect().top - now) > 1) return;
      if (calm()) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${was - now}px)`;
      void el.offsetHeight;
      el.style.transition = `transform ${MS}ms ${ease()}`;
      el.style.transform = "";
    };
    // The starting top, so the first move knows where it came from.
    if (ref.current) last = topOf(ref.current);
    window.addEventListener(EVENT, onMove);
    return () => window.removeEventListener(EVENT, onMove);
  }, [ref]);
}
