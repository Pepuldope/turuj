import { activeClosures } from "@/lib/closures";
import type { Closure } from "@/lib/types";

/**
 * What the line above the Save button says about the trail on the plan's day. Closure data is safety data:
 * no rule at all is "unverified" and a rule that is not in force that day is "no known closure", never "open".
 * Null before the day is known (before hydration).
 */
export type TrailStatus = "closed" | "unverified" | "no-known-closure";

export function trailStatus(closures: readonly Closure[], date: string | null): TrailStatus | null {
  if (!date) return null;
  if (activeClosures(closures as Closure[], date).length > 0) return "closed";
  return closures.length === 0 ? "unverified" : "no-known-closure";
}

/** The newest `verified_on` of the rules (ISO), or null when none has one. */
export function newestVerified(closures: readonly Closure[]): string | null {
  const days = closures.map((c) => c.verified_on).filter(Boolean);
  return days.length > 0 ? days.reduce((a, b) => (b > a ? b : a)) : null;
}
