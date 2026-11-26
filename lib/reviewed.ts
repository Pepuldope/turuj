"use client";

import { useEffect, useSyncExternalStore } from "react";
import { FITS, TIMINGS } from "@/lib/reviewLimits";
import type { Fit, Timing } from "@/lib/reviewLimits";
import "@/lib/legacyStorage";

// Which trips this browser has sent a quick review for, with how many stars and which choices, so a visit can
// show its stars instead of "Ohodnotiť" and the rating window can open with the old answers. Kept on the device only: the review itself is on the server without a name, and the
// server keeps one review per trip and browser (a second one replaces the first).

const KEY = "turuj-reviewed";
/** The random id this browser reviews under (made by lib/sendReview.ts with its first review). */
export const REVIEWER_KEY = "turuj-reviewer";
/** Set once the server was asked for the stars of reviews sent before the browser kept them. */
const ASKED_KEY = "turuj-reviewed-asked";
/** Trip slug -> the three choices of the review, kept beside the stars so the rating window can open with them. */
const CHOICES_KEY = "turuj-review-choices";

/** A review as the browser keeps it: what it sent. */
export interface KeptReview {
  stars: number;
  fit: Fit | null;
  crowded: boolean | null;
  timing: Timing | null;
}
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

/** The three choices of a review, beside its stars. */
export type KeptChoices = Pick<KeptReview, "fit" | "crowded" | "timing">;
const NO_CHOICES: KeptChoices = { fit: null, crowded: null, timing: null };

function readChoices(): Record<string, KeptChoices> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHOICES_KEY) ?? "{}") as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, KeptChoices>) : {};
  } catch {
    return {};
  }
}

/** The review this browser last sent for a trip, to open the rating window with; no stars (0) when there is none. */
export function keptReview(slug: string): KeptReview {
  return { stars: readReviewed()[slug] ?? 0, ...NO_CHOICES, ...readChoices()[slug] };
}

/**
 * Remembers a review the server accepted. A choice left empty keeps the answer given before, as the server
 * does (lib/reviews.ts saveReview).
 */
export function noteReviewed(slug: string, review: KeptReview) {
  try {
    const before = { ...NO_CHOICES, ...readChoices()[slug] };
    const choices: KeptChoices = { fit: review.fit ?? before.fit, crowded: review.crowded ?? before.crowded, timing: review.timing ?? before.timing };
    localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...readChoices(), [slug]: choices }));
    localStorage.setItem(KEY, JSON.stringify({ ...readReviewed(), [slug]: review.stars }));
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

/** What the browser keeps of its reviews: the stars and the choices, each by trip slug. */
export interface Kept {
  stars: Record<string, number>;
  choices: Record<string, KeptChoices>;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (list.includes(v as T) ? (v as T) : null);

/**
 * Adds the server's reviews for trips this browser has no stars kept for; what the browser keeps is the newer
 * copy. The same object when nothing was added, so nothing is written.
 */
export function withServerReviews(kept: Kept, server: unknown): Kept {
  if (typeof server !== "object" || server === null || Array.isArray(server)) return kept;
  const stars = { ...kept.stars };
  const choices = { ...kept.choices };
  let added = false;
  for (const [slug, r] of Object.entries(server as Record<string, unknown>)) {
    if (slug in kept.stars || typeof r !== "object" || r === null) continue;
    const { stars: n, fit, crowded, timing } = r as Record<string, unknown>;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 5) continue;
    stars[slug] = n;
    choices[slug] = { fit: oneOf(FITS, fit), crowded: typeof crowded === "boolean" ? crowded : null, timing: oneOf(TIMINGS, timing) };
    added = true;
  }
  return added ? { stars, choices } : kept;
}

let asking: Promise<void> | null = null;

/**
 * Once per browser (Peter, 26 Nov 2026): reviews sent before the browser kept its own copy are asked for from
 * the server, by the random id the browser reviews under, so a visited trip shows its stars (never just the
 * word "ohodnotené") and the rating window opens with the old answers. A browser that never reviewed has no id
 * and nothing to ask. A failed try (no signal) is repeated on the next visit.
 */
export function askForOldReviews(): Promise<void> {
  asking ??= (async () => {
    try {
      const reviewer = localStorage.getItem(REVIEWER_KEY);
      if (!reviewer || localStorage.getItem(ASKED_KEY) === "1") return;
      const r = await fetch("/api/review/mine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewer }) });
      if (!r.ok) throw new Error(String(r.status));
      const kept: Kept = { stars: readReviewed(), choices: readChoices() };
      const next = withServerReviews(kept, ((await r.json()) as { reviews?: unknown }).reviews);
      if (next !== kept) {
        localStorage.setItem(CHOICES_KEY, JSON.stringify(next.choices));
        localStorage.setItem(KEY, JSON.stringify(next.stars));
      }
      localStorage.setItem(ASKED_KEY, "1");
      if (next !== kept) window.dispatchEvent(new Event(EVENT));
    } catch {
      // No signal, storage blocked or the server is busy: asked again next time.
      asking = null;
    }
  })();
  return asking;
}

/** useReviewed where a visited trip shows its stars: also fetches the reviews sent before the browser kept them, once. */
export function useMyStars(): Record<string, number> {
  useEffect(() => {
    void askForOldReviews();
  }, []);
  return useReviewed();
}
