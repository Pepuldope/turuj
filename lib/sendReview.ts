"use client";

import { track } from "@/lib/analytics";
import { noteReviewed } from "@/lib/reviewed";
import type { Fit, Timing } from "@/lib/reviewLimits";
import "@/lib/legacyStorage";

const REVIEWER_KEY = "turuj-reviewer";

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
    if (r.status === 403 && (await r.json().catch(() => null))?.error === "preview") return "preview";
    if (!r.ok) throw new Error(String(r.status));
    track("review_sent", { trail: slug });
    noteReviewed(slug, answers.stars);
    return "ok";
  } catch {
    return "error";
  }
}
