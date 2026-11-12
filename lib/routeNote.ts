import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import { floorTo5 } from "@/lib/days";
import { formatTime } from "@/lib/format";

/** A walk whose latest start is before this is a long one: it has to begin early in the morning. */
const LONG_BEFORE = "10:00";
/** The latest start must be at least this long after sunrise, or the day is too short for the route. */
const AFTER_SUNRISE_MIN = 15;

export type RouteNote =
  /** Back in the light even from a late-morning start. */
  | { kind: "ok" }
  /** Only an early start fits: `latest` is the latest walk start ("HH:MM"). */
  | { kind: "long"; latest: string }
  /** Even a start at first light doesn't get back before dark. */
  | { kind: "too-long" };

/**
 * What one route row says about the chosen day (Peter, 2026-11-12: Kedy is the last step, so the route
 * step can't know the time yet and judges the day alone): the latest walk start that still ends
 * SAFE_MARGIN_MIN before sunset, for this route's walking minutes (kids pace included).
 */
export function routeNote(sunrise: Date, sunset: Date, walkMin: number): RouteNote {
  const latest = floorTo5(new Date(sunset.getTime() - (walkMin + SAFE_MARGIN_MIN) * 60000));
  if (latest.getTime() < sunrise.getTime() + AFTER_SUNRISE_MIN * 60000) return { kind: "too-long" };
  const at = formatTime(latest);
  return at < LONG_BEFORE ? { kind: "long", latest: at } : { kind: "ok" };
}
