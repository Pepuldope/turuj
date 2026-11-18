import { stepHours } from "@/lib/tripProfile";
import type { MarkingRun, RouteBrief, TripDetail } from "@/lib/tripSchema";

// Up one way, down another: most places have a second marked route from the same start, so a
// loop needs no new map data, only two routes put together (Peter, 2026-10-23: the round routes
// people like). The trip page offers it as "Späť: inou cestou" (/trasa/<slug>/okruh).

/** A loop's own address under its route: /trasa/<slug>/okruh, and its key among the place's routes. */
export const LOOP_SUFFIX = "/okruh";

/** Both routes start this close to each other: the same car park or stop. */
const SAME_START_M = 300;
/** More of either way than this on the other, and it isn't a different way back. */
const MAX_SHARED = 0.4;
/** A point this close to the other way counts as on it. */
const ON_WAY_M = 60;
/** A way back this much longer than the way up makes a different trip, not a loop. */
const MAX_LONGER = 1.6;

type LonLat = readonly [number, number, ...unknown[]];

/** Metres, flat-earth: plenty within a few km and cheap enough to run for every trip page at build. */
function metres(a: LonLat, b: LonLat): number {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110540);
}

const sample = <T,>(xs: readonly T[], n: number) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0);

/** Share of `a` (sampled) that runs along `b`. */
function shared(a: readonly LonLat[], b: readonly LonLat[]): number {
  const pts = sample(a, 60);
  const ref = sample(b, 400);
  return pts.filter((p) => ref.some((q) => metres(p, q) < ON_WAY_M)).length / pts.length;
}

/** The other route to come back by from this one, or null: same start, a clearly different way, not far longer. */
export function loopPartner(slug: string, routes: readonly RouteBrief[]): RouteBrief | null {
  const own = routes.find((r) => r.slug === slug);
  if (!own || own.up.length < 2) return null;
  let best: { r: RouteBrief; shared: number } | null = null;
  for (const r of routes) {
    if (r === own || r.up.length < 2 || r.slug.endsWith(LOOP_SUFFIX)) continue;
    if (metres(own.up[0], r.up[0]) > SAME_START_M) continue;
    if (r.duration_min > own.duration_min * MAX_LONGER) continue;
    const s = Math.max(shared(own.up, r.up), shared(r.up, own.up));
    if (s > MAX_SHARED) continue;
    if (!best || s < best.shared) best = { r, shared: s };
  }
  return best?.r ?? null;
}

/** Walking hours and climb along a path in the given order (only ratios are used). */
function effort(path: TripDetail["path"], order: number[]): { hours: number; m: number; climb: number } {
  let last = path.find((p) => p[2] !== null)?.[2] ?? 0;
  const ele = path.map((p) => (last = p[2] ?? last));
  let hours = 0;
  let m = 0;
  let climb = 0;
  for (let k = 1; k < order.length; k++) {
    const [a, b] = [order[k - 1], order[k]];
    const d = metres(path[a], path[b]);
    hours += stepHours(d, ele[b] - ele[a]);
    m += d;
    climb += Math.max(0, ele[b] - ele[a]);
  }
  return { hours, m, climb };
}

/**
 * `own` up to its goal, then `other` walked back down from the goal: one "okruh" trip the trip page
 * draws like any loop. Times, length and climb are `own`'s there-and-back numbers scaled by how much
 * harder the loop is along the paths, so both choices count the same way.
 */
export function loopTrip(own: TripDetail, other: TripDetail): TripDetail {
  const n = own.path.length;
  const m = other.path.length;
  const back = [...other.path].reverse().slice(1);
  const path = [...own.path, ...back];
  // other's point j sits at n - 1 + (m - 1 - j) on the loop.
  const at = (j: number) => n - 1 + (m - 1 - j);
  const runs: MarkingRun[] = [
    ...own.marking_runs.filter((r) => r.from < n),
    ...other.marking_runs
      .map((r) => ({ ...r, from: at(Math.min(r.to, m - 1)), to: at(r.from) }))
      .reverse(),
  ];
  const ownOrder = [...own.path.keys(), ...[...own.path.keys()].reverse().slice(1)];
  const was = effort(own.path, ownOrder);
  const now = effort(path, [...path.keys()]);
  const scale = (v: number, a: number, b: number) => (b > 0 ? Math.round((v * a) / b) : v);
  const seen = new Set(own.pois.map((p) => p.name));
  return {
    ...own,
    route: "okruh",
    path,
    turnaround_index: n - 1,
    marking_runs: runs,
    duration_min: Math.round(scale(own.duration_min, now.hours, was.hours) / 5) * 5,
    distance_m: scale(own.distance_m, now.m, was.m),
    ascent_m: scale(own.ascent_m, now.climb, was.climb),
    max_ele_m: Math.max(own.max_ele_m ?? 0, other.max_ele_m ?? 0) || own.max_ele_m,
    marking: [...new Set([...own.marking, ...other.marking])],
    pois: [...own.pois, ...other.pois.filter((p) => !seen.has(p.name))],
    // The GPX file is the there-and-back route's: no file for the loop yet.
    gpx_url: "",
  };
}

/**
 * The order of the route list (Peter, 18 Nov): the main route, then "Iným chodníkom", then the loops; the rest
 * ("Iná cesta", "Cez …", "Kratšia" …) after them, as they were. The colours follow the list.
 */
export function orderRoutes(routes: RouteBrief[]): RouteBrief[] {
  const rank = (r: RouteBrief) => {
    const label = r.route_label ?? "Hlavná cesta";
    if (label === "Hlavná cesta") return 0;
    if (label === "Iným chodníkom") return 1;
    if (r.slug.endsWith(LOOP_SUFFIX)) return 2;
    return 3;
  };
  return routes.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(({ r }) => r);
}
