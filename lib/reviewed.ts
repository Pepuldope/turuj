"use client";

import { useSyncExternalStore } from "react";
import "@/lib/legacyStorage";

// Which trips this browser has sent a quick review for, and with how many stars, so a visit can show its stars
// instead of "Ohodnotiť". Kept on the device only: the review itself is on the server without a name, and the
// server keeps one review per trip and browser (a second one replaces the first).

const KEY = "turuj-reviewed";
const EVENT = "turuj-reviewed";
const EMPTY: Record<string, number> = {};

let cachedRaw: string | null = null;
let cached: Record<string, number> = EMPTY;

export function readReviewed(): Record<string, number> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  // Same string -> same object, so useSyncExternalStore doesn't loop.
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : EMPTY;
    cached = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, number>) : EMPTY;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

/** Remembers that a review of this trip was accepted by the server. */
export function noteReviewed(slug: string, stars: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readReviewed(), [slug]: stars }));
  } catch {
    // Storage full / blocked: the trip then keeps offering "Ohodnotiť".
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Trip slug -> stars of the review sent from this browser. */
export function useReviewed(): Record<string, number> {
  return useSyncExternalStore(subscribe, readReviewed, () => EMPTY);
}
