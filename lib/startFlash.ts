"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

// The start row has flashed in this browser session.
const FLASH_KEY = "turuj-start-flash";
/** How long the highlight lasts (matches the .start-flash animation in globals.css). */
export const FLASH_MS = 1300;
// Once per page load too, in case storage is blocked.
let flashed = false;

/**
 * True for a moment, once per browser session, to say "this is where we plan from" by briefly lighting
 * the start row up, without a banner to dismiss (Peter, 2026-11-11). With `seen`, it waits until that
 * element is on screen: the trip page's start row sits below the photo and map, and a flash on load
 * played out of sight (Peter, 2026-11-12: "it does not seem to be working").
 */
export function useStartFlash(auto: boolean, seen?: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!auto || flashed) return;
    try {
      if (sessionStorage.getItem(FLASH_KEY)) return;
    } catch {
      // Storage blocked: the page-load flag still keeps it to once.
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      setOn(true);
      timer = setTimeout(() => {
        flashed = true;
        try {
          sessionStorage.setItem(FLASH_KEY, "1");
        } catch {
          // See above.
        }
        setOn(false);
      }, FLASH_MS);
    };
    const el = seen?.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      go();
      return () => clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        go();
      },
      { threshold: 0.9 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [auto, seen]);
  return on;
}
