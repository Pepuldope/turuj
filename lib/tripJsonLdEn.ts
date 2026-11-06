import { routeWalk } from "@/lib/data";
import { formatDistance, formatDuration } from "@/lib/format";
import { pickWalk } from "@/lib/walkFacts";
import type { TripDetail } from "@/lib/tripSchema";
import type { TrailDetail } from "@/lib/types";

/**
 * A short English description for an English trip page's JSON-LD (F18): built from the trip's own
 * numbers, the same walk the page shows, so it never carries the Slovak generated line. Names stay Slovak.
 */
export function describeTripEn(trip: TripDetail, detail: TrailDetail): string {
  const { trail } = detail;
  const w = pickWalk(routeWalk(detail), false, detail.parkingLots.length > 0);
  const ele = trip.destination.ele_m;
  const km = formatDistance(w?.m ?? trail.distance_m, "en");
  const up = w?.ascentM ?? trail.ascent_m;
  const time = formatDuration(w?.min ?? trail.duration_min).replace(/ /g, " ");
  const shape = trip.route === "okruh" ? "a loop" : "out and back";
  return `${trail.name}${ele ? ` (${Math.round(ele)} m)` : ""}: a day hike starting at ${trip.start.name}, ${shape}. ${km}, ${up} m of climbing, about ${time} on foot without breaks.`;
}
