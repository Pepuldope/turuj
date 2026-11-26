"use client";

import { useEffect } from "react";

let locks = 0;

/**
 * While a window is open the page behind it does not scroll (Peter, 26 Nov 2026: "I can scroll the site behind
 * the popup"). Counted, because one window can open on top of another ("Vaše návštevy" opens the visit window).
 */
export function useScrollLock(): void {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (locks++ === 0) {
      // The scrollbar's width, so the page does not jump sideways on a desktop when the bar goes away.
      const bar = window.innerWidth - root.clientWidth;
      root.style.overflow = "hidden";
      body.style.overflow = "hidden";
      if (bar > 0) body.style.paddingRight = `${bar}px`;
    }
    return () => {
      if (--locks > 0) return;
      root.style.overflow = "";
      body.style.overflow = "";
      body.style.paddingRight = "";
    };
  }, []);
}
