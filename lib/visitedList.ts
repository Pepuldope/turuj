// The "Navštívené" list in Moje výlety (Peter, 25 Nov 2026): one row per place, under the year of its latest
// visit. Pure; the trip's own data (picture, kind, routes) is loaded by the list when it is shown.
import { latestFirst, planVisitId, routeTrip } from "@/lib/visits";
import type { Visit, VisitHow } from "@/lib/visits";
import { whenYear } from "@/lib/visitWhen";
import type { SavedTrip } from "@/lib/savedTrips";

export interface VisitedPlace {
  /** The place's main trip, or, for a visit that has no place yet, the trip of its route. */
  key: string;
  /** The latest first. */
  visits: Visit[];
  /** The year of the latest visit; null when no visit of the place has a date. */
  year: number | null;
}

/** The key a visit is listed under. A visit always has its place or its route. */
export const placeKey = (visit: Visit): string => visit.slug || routeTrip(visit.route);

/** The visited places, the one visited latest first. */
export function visitedPlaces(visits: readonly Visit[]): VisitedPlace[] {
  const groups = new Map<string, Visit[]>();
  for (const v of visits) {
    const key = placeKey(v);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups]
    .map(([key, list]) => {
      const sorted = [...list].sort(latestFirst);
      return { key, visits: sorted, year: whenYear(sorted[0].date) };
    })
    .sort((a, b) => latestFirst(a.visits[0], b.visits[0]));
}

/** The list's sections: the years, the newest first, then the places with no date at all (`year` null). */
export function byYear(places: readonly VisitedPlace[]): { year: number | null; places: VisitedPlace[] }[] {
  const years = [...new Set(places.map((p) => p.year))].sort((a, b) => (a === null ? 1 : b === null ? -1 : b - a));
  return years.map((year) => ({ year, places: places.filter((p) => p.year === year) }));
}

/** What "Ísť znova" starts from: the route walked last time and, while it is still on the device, the plan of that day. */
export interface LastWalk {
  /** As step 1 names it: a trip slug, or `<slug>/okruh` for a loop. */
  route: string;
  plan: SavedTrip | null;
  /** How that visit went (start, way of travel, kids, stops), kept with the visit for good; null when it has none. */
  how: VisitHow | null;
}

/**
 * The latest visit whose route is known (`visits` the latest first), with the saved plan it came from and the `how` kept with it. Null when
 * the visitor never said which route they walked. A plan saved again for another day no longer matches its old
 * visit, so it is not taken for "last time".
 */
export function lastWalk(visits: readonly Visit[], trips: readonly SavedTrip[]): LastWalk | null {
  const visit = visits.find((v) => v.route);
  if (!visit) return null;
  return { route: visit.route, plan: trips.find((x) => planVisitId(x.route ?? x.slug, x.date) === visit.id) ?? null, how: visit.how ?? null };
}
