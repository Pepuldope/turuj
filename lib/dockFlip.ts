"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

// The phone's top of screen holds three things: the top bar (slides away while scrolling down), the
// start reminder (when no start is set) and the stuck search row. The bar and the reminder move by
// transform; a stuck row's `top` would have to animate on the main thread and lag behind them
// (Peter, 2026-11-03). So a stuck row jumps to its new `top` at once and is slid there by a transform
// over the same 200 ms, moving together with the bar as one piece.

const EVENT = "turuj-dock";
const MS = 200;

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
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${was - now}px)`;
      void el.offsetHeight;
      el.style.transition = `transform ${MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      el.style.transform = "";
    };
    // The starting top, so the first move knows where it came from.
    if (ref.current) last = topOf(ref.current);
    window.addEventListener(EVENT, onMove);
    return () => window.removeEventListener(EVENT, onMove);
  }, [ref]);
}
