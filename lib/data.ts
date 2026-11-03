import { distanceAlongM, nearestOnPath } from "@/lib/geo";
import { formatWalk } from "@/lib/format";
import { trailJoin } from "@/lib/trailJoin";
import { isClearlyShorter, pickWalk, stopsByWalk, walkFacts } from "@/lib/walkFacts";
import type { RouteWalk } from "@/lib/walkFacts";
import type { TrailJoin } from "@/lib/trailJoin";
import { closureRulesFor } from "@/lib/trips";
import type { Parking, ShorterRoute, TransitStop as TripStop, TripDetail, TripSummary, WalkLine } from "@/lib/tripSchema";
import type { Closure, ParkingLot, TrailDetail, Trail, LatLng, TransitStop } from "@/lib/types";

// The pages still speak the older TrailDetail shape; this adapts the static
// trip data (lib/trips.ts, docs/TRIP-DATA.md) to it. New code should use
// lib/trips.ts directly.

function parkingLot(p: Parking, slug: string, i: number, join: TrailJoin | null): ParkingLot {
  const fee = p.fee === true ? ", spoplatnené" : p.fee === false ? ", bezplatné" : "";
  return {
    id: `${slug}:parking:${i}`,
    trailhead_id: `${slug}:start`,
    name: p.name ?? "Parkovisko",
    location: p.location,
    surface_type: null,
    note: join ? `${formatWalk(join.walk_m)} od trasy${fee}. Zdroj: OpenStreetMap.` : `${formatWalk(p.walk_m)} od začiatku trasy${fee}. Zdroj: OpenStreetMap.`,
    verified_on: null,
    walk_m: p.walk_m,
    fee: p.fee,
    join,
    walk: cutWalk(p.walk, join),
  };
}

/** The stored walk up to where it joins the trail (it may go on along the trail to the start). */
function cutWalk(walk: WalkLine | undefined, join: TrailJoin | null): WalkLine | null {
  if (!walk) return null;
  if (join?.walk_cut === undefined) return walk;
  const line = [...walk.line.slice(0, join.walk_cut + 1), [join.location.lon, join.location.lat] as [number, number]];
  return { ...walk, line, m: join.walk_m, min: Math.max(1, Math.round((walk.min * join.walk_m) / Math.max(1, walk.m))) };
}

function transitStop(s: TripStop, slug: string, i: number, join: TrailJoin | null): TransitStop {
  return {
    id: `${slug}:stop:${i}`,
    trailhead_id: `${slug}:start`,
    name: s.name,
    mode: s.mode,
    location: s.location,
    distance_m: s.walk_m,
    join,
    walk: cutWalk(s.walk, join),
  };
}

function toTrail(t: TripSummary): Trail {
  const [w, s, e, n] = t.bbox;
  return {
    id: t.slug,
    name: t.name,
    slug: t.slug,
    description: t.description,
    distance_m: t.distance_m,
    ascent_m: t.ascent_m,
    difficulty: t.difficulty,
    duration_min: t.duration_min,
    family_friendly: t.family_friendly,
    gpx_path: t.gpx_url.replace(/^\//, ""),
    marking: t.marking[0] ?? null,
    goal: t.destination.kind,
    region_name: t.region_name,
    goal_location: t.destination.location,
    goal_name: t.destination.name,
    rank: t.rank,
    ...(t.shorter ? { shorter: t.shorter } : {}),
    ...(t.easier ? { easier: t.easier } : {}),
    bbox: { sw: { lat: s, lon: w }, ne: { lat: n, lon: e } },
    created_at: "",
  };
}

/** A place this far from the line itself is off the walk: you step aside to it and back. */
const OFF_TRAIL_M = 30;
/** Small paths wind: the way there is about this much longer than the straight line. */
const PATH_FACTOR = 1.3;
/** 4 km/h, as the walking times count flat ground. */
const WALK_M_PER_MIN = 4000 / 60;

/**
 * Minutes there and back to a place the build lists as on the walk but that stands a little off it
 * (a spring down a short path: Peter, 2026-10-24), or null when it is right by the line. Such places
 * then get a side trip like the ones further away (lib/tripStops.ts, components/TripMap.tsx).
 */
function offTrailDetour(path: TripDetail["path"], at: LatLng): number | null {
  const hit = nearestOnPath(path.map(([lon, lat]) => ({ lat, lon })), at);
  if (!hit || hit.distanceM <= OFF_TRAIL_M) return null;
  return Math.max(1, Math.ceil((2 * hit.distanceM * PATH_FACTOR) / WALK_M_PER_MIN));
}

/** A trip from the files or the database, in the shape the pages use. */
export function trailDetailFrom(t: TripSummary | TripDetail): TrailDetail {
  const d = "path" in t ? t : null;
  const parking = [t.parking, ...(d?.parking_alternatives ?? [])].filter((p): p is Parking => p != null);
  const stops = [t.transit, ...(d?.transit_alternatives ?? [])].filter((s): s is TripStop => s != null);
  // Parked or got off up the trail: join it at its nearest point (needs the path).
  // The stored walk counts too: where it first meets the trail is the natural way in.
  // Without the path (the home list) the join comes stored with the place (scripts/list-joins.ts).
  const joinOf = (at: LatLng, walkM: number, walk?: WalkLine, stored?: TrailJoin) =>
    d ? trailJoin(d.path, at, walkM, d.route === "okruh", walk) : (stored ?? null);
  const closures: Closure[] = closureRulesFor(t).map((r) => ({
    id: r.id,
    trail_id: t.slug,
    kind: r.kind,
    starts_on: r.starts_on,
    ends_on: r.ends_on,
    reason: r.reason,
    source_url: r.source_url,
    verified_on: r.verified_on,
    ...(r.trip_notes?.[t.slug] ? { note: r.trip_notes[t.slug] } : {}),
  }));
  return {
    trail: toTrail(t),
    trailheads: [{ id: `${t.slug}:start`, trail_id: t.slug, name: t.start.name, location: t.start.location, is_primary: true }],
    parkingLots: parking.map((p, i) => parkingLot(p, t.slug, i, joinOf(p.location, p.walk_m, p.walk, p.join))),
    transitStops: stops.map((s, i) => transitStop(s, t.slug, i, joinOf(s.location, s.walk_m, s.walk, s.join))),
    closures,
    fees: t.fees,
    pois: (d?.pois ?? [])
      .map((p, i) => ({
        id: `${t.slug}:poi:${i}`,
        trail_id: t.slug,
        kind: p.kind,
        name: p.name,
        location: p.location,
        note: null,
        // Out-and-back paths stop at the goal, so this is the way up.
        along_m: Math.round(distanceAlongM(d!.path, p.location)),
        detour_min: p.detour_min ?? (d ? offTrailDetour(d.path, p.location) : null),
        food: p.food ?? null,
      }))
      // On the walk in walking order, then side trips, shortest first.
      .sort((a, b) => (a.detour_min ?? 0) - (b.detour_min ?? 0) || a.along_m - b.along_m),
  };
}

export interface TrailSearchFilters {
  /** Maximum time budget, in hours. Trails longer than this are excluded. */
  maxHours?: number;
  /** Require family_friendly = true. */
  withKids?: boolean;
}

export function filterTrails(trails: TrailDetail[], filters: TrailSearchFilters): TrailDetail[] {
  return trails.filter(({ trail }) => {
    if (filters.maxHours != null && trail.duration_min > filters.maxHours * 60) return false;
    if (filters.withKids && !trail.family_friendly) return false;
    return true;
  });
}

export function trailCenter(trail: Trail): LatLng | null {
  if (!trail.bbox) return null;
  return {
    lat: (trail.bbox.sw.lat + trail.bbox.ne.lat) / 2,
    lon: (trail.bbox.sw.lon + trail.bbox.ne.lon) / 2,
  };
}

export function primaryTrailhead(detail: TrailDetail) {
  return detail.trailheads.find((t) => t.is_primary) ?? detail.trailheads[0] ?? null;
}

/** The stop the trip page starts from by bus or train (the shortest walk to the trail), or null. */
export function nearestStop(detail: TrailDetail): TransitStop | null {
  return stopsByWalk(detail.transitStops)[0] ?? null;
}

/** The walk from the default parking and from the default stop, as the trip page counts them. */
export function routeWalk(detail: TrailDetail): RouteWalk {
  const stop = nearestStop(detail);
  return {
    car: walkFacts(detail.trail, detail.parkingLots[0] ?? null),
    bus: stop ? walkFacts(detail.trail, stop) : null,
  };
}

/** Where the drive ends: the nearest parking lot, else the trailhead itself. */
export function driveDestination(detail: TrailDetail): LatLng | null {
  return detail.parkingLots[0]?.location ?? primaryTrailhead(detail)?.location ?? trailCenter(detail.trail);
}

/** Where sunrise/sunset are computed for a trail. */
export function sunLocation(detail: TrailDetail): LatLng | null {
  return detail.parkingLots[0]?.location ?? trailCenter(detail.trail);
}

/** The walk the trip page and the home list count by car (lib/walkFacts.ts), without the kids pace. */
export function walkFromCar(trip: TripSummary | TripDetail): number {
  const detail = trailDetailFrom(trip);
  return pickWalk(routeWalk(detail), false, detail.parkingLots.length > 0)?.min ?? trip.duration_min;
}

/**
 * The quickest other route to the same place, by car (routes with parking) and by bus, when it is
 * clearly shorter than this one's walk as the trip pages count both (home list: scripts/list-joins.ts).
 */
export function shorterRoutes(main: TrailDetail, others: TrailDetail[]): TripSummary["shorter"] {
  const pick = (bus: boolean): ShorterRoute | undefined => {
    const mine = pickWalk(routeWalk(main), bus, main.parkingLots.length > 0)?.min;
    if (mine === undefined) return undefined;
    let best: ShorterRoute | undefined;
    for (const o of others) {
      const w = routeWalk(o);
      const f = bus ? w.bus : o.parkingLots.length > 0 ? w.car : null;
      if (f && isClearlyShorter(f.min, mine) && (!best || f.min < best.min)) best = { slug: o.trail.slug, min: f.min };
    }
    return best;
  };
  const car = pick(false);
  const bus = pick(true);
  return car || bus ? { ...(car ? { car } : {}), ...(bus ? { bus } : {}) } : undefined;
}

const DIFFICULTY_RANK: Record<TrailDetail["trail"]["difficulty"], number> = { lahka: 0, stredna: 1, tazka: 2 };

/** The easiest other route to the place, when it is easier than the main one (home list: scripts/list-joins.ts). */
export function easierRoute(main: TrailDetail, others: TrailDetail[]): TripSummary["easier"] {
  let best: TrailDetail | undefined;
  for (const o of others) {
    if (DIFFICULTY_RANK[o.trail.difficulty] >= DIFFICULTY_RANK[(best ?? main).trail.difficulty]) continue;
    best = o;
  }
  return best ? { slug: best.trail.slug, difficulty: best.trail.difficulty } : undefined;
}
