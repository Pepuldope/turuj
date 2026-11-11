"use client";

import { useEffect, useState } from "react";

// The start row has flashed in this browser session.
const FLASH_KEY = "turuj-start-flash";
/** How long the highlight lasts (matches the .start-flash animation in globals.css). */
export const FLASH_MS = 1300;
// Once per page load too, in case storage is blocked.
let flashed = false;

/**
 * True for a moment, once per browser session, when the start was picked up automatically (the browser
 * already lets us find the location): the start row says "this is where we think you are" by briefly
 * lighting up, without a banner to dismiss (Peter, 2026-11-11). Never for a typed or picked start.
 */
export function useStartFlash(auto: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!auto || flashed) return;
    try {
      if (sessionStorage.getItem(FLASH_KEY)) return;
    } catch {
      // Storage blocked: the page-load flag still keeps it to once.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(true);
    const timer = setTimeout(() => {
      flashed = true;
      try {
        sessionStorage.setItem(FLASH_KEY, "1");
      } catch {
        // See above.
      }
      setOn(false);
    }, FLASH_MS);
    return () => clearTimeout(timer);
  }, [auto]);
  return on;
}
