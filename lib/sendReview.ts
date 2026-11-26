"use client";

import { track } from "@/lib/analytics";
import { REVIEWER_KEY, noteReviewed } from "@/lib/reviewed";
import type { Fit, Timing } from "@/lib/reviewLimits";
import "@/lib/legacyStorage";

/** A random id this browser keeps, so a second review of a trip replaces the first (nothing about the person). */
function reviewerId(): string {
  try {
    let id = localStorage.getItem(REVIEWER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(REVIEWER_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export interface ReviewAnswers {
  stars: number;
  fit: Fit | null;
  crowded: boolean | null;
  timing: Timing | null;
}

/** Sends the quick review of a trip. "preview": a preview site refuses writes (HTTP 403, error "preview"). */
export async function sendReview(slug: string, answers: ReviewAnswers): Promise<"ok" | "preview" | "error"> {
  try {
    const r = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, reviewer: reviewerId(), ...answers }),
    });
    if (r.status === 403 && (await r.json().catch(() => null))?.error === "preview") {
      // A preview never stores a rating, but the browser keeps it as if it had: otherwise the visitor's own stars
      // and the old answers in the rating window could not be tried on a preview at all (Peter checks previews first).
      noteReviewed(slug, answers);
      return "preview";
    }
    if (!r.ok) throw new Error(String(r.status));
    track("review_sent", { trail: slug });
    noteReviewed(slug, answers);
    return "ok";
  } catch {
    return "error";
  }
}
