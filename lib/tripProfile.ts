/**
 * The walk as a height profile over time, for the sun-arc picture on the
 * trip page. Pure: built on the server from TripDetail.path, then laid on the
 * day's clock in the browser.
 */
import type { PoiIcon } from "@/lib/food";
import { poiIcon } from "@/lib/food";
import type { DestinationKind, MarkColour, PoiKind, TripDetail } from "@/lib/tripSchema";

export interface ProfilePoint {
  /** Height, metres. */
  ele: number;
  /** Share of the walking time spent before this point, 0..1. */
  at: number;
  /** Trail marking from the previous point to this one; null = unmarked. */
  colour: MarkColour | null;
  /** Where on the map this point is, [lat, lon]: the day map's walker follows the sun dial along it. Missing on old saved trips and on the standing points. */
  pos?: [number, number];
}

export interface TripProfile {
  /** The whole walk: there and back for "tam-a-spat", the loop for "okruh". */
  points: ProfilePoint[];
  /** Index into points of the goal (peak, lake, castle...). */
  goalIndex: number;
  goalName: string;
  goalKind: DestinationKind;
  loop: boolean;
  /**
   * Where the walk passes each place on the trip page (its Poi id), as a share of the walking time:
   * on the way there, and on the way back for "tam-a-spat" (null on a loop). Missing on old saved trips.
   */
  places?: { id: string; kind: PoiKind; icon?: PoiIcon; out: number; back: number | null; name?: string; detour?: number }[];
  /** Stops the group added, as stretches of the day spent standing (filled by withStops). */
  pauses?: { from: number; to: number; name: string; kind?: PoiKind; icon?: PoiIcon }[];
}

/** A stop laid on the walk: where it is (share of the walking time) and how long it takes. */
export interface PauseAt {
  at: number;
  min: number;
  name: string;
  /** The place's kind, for its colour and icon (none for the lunch break). */
  kind?: PoiKind;
  /** Its pictogram (food places by kind of food place). */
  icon?: PoiIcon;
}

/** About this many points is plenty for a 360 px wide picture. */
const MAX_POINTS = 140;

function metres(a: [number, number, unknown], b: [number, number, unknown]): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * DIN 33466 walking hours for one step: 4 km/h flat, 300 m/h up, 500 m/h
 * down; the larger of flat and climb plus half the smaller. Only ratios are
 * used, the trip's own duration_min stays the total.
 */
export function stepHours(distM: number, dEleM: number): number {
  const flat = distM / 4000;
  const climb = dEleM > 0 ? dEleM / 300 : -dEleM / 500;
  return Math.max(flat, climb) + Math.min(flat, climb) / 2;
}

export function buildProfile(trip: TripDetail): TripProfile | null {
  const path = trip.path;
  if (path.length < 2) return null;

  // segColour[i] = marking of the stretch from path[i] to path[i + 1].
  const segColour: (MarkColour | null)[] = path.map(() => null);
  for (const run of trip.marking_runs) {
    for (let i = run.from; i < run.to && i < path.length; i++) segColour[i] = run.colour;
  }

  // Fill missing heights with the last known one.
  let last = path.find((p) => p[2] !== null)?.[2] ?? trip.start.ele_m ?? 0;
  const ele = path.map((p) => (last = p[2] ?? last));

  const loop = trip.route === "okruh";
  const turn = Math.min(Math.max(trip.turnaround_index, 0), path.length - 1);
  // There-and-back paths are stored one way: walk them back reversed.
  const order = loop ? path.map((_, i) => i) : [...path.keys(), ...[...path.keys()].reverse().slice(1)];
  const goalAt = loop ? turn : path.length - 1;

  const cost = [0];
  for (let k = 1; k < order.length; k++) {
    const a = order[k - 1];
    const b = order[k];
    cost.push(cost[k - 1] + stepHours(metres(path[a], path[b]), ele[b] - ele[a]));
  }
  const total = cost[cost.length - 1] || 1;

  // Keep every nth point plus the goal and the end, so the picture stays light.
  const step = Math.max(1, Math.ceil(order.length / MAX_POINTS));
  const keep = new Set<number>([0, goalAt, order.length - 1]);
  for (let k = 0; k < order.length; k += step) keep.add(k);
  const kept = [...keep].sort((a, b) => a - b);

  // A point carries the colour of the stretch just walked to reach it (the first one, of the first stretch).
  const colourOf = (k: number) => segColour[k === 0 ? 0 : Math.min(order[k], order[k - 1])];
  const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

  // Each place by the path vertex nearest to it (side trips leave the walk about there).
  const last2 = order.length - 1;
  const places = (trip.pois ?? []).map((poi, i) => {
    let best = 0;
    let bestM = Infinity;
    for (let j = 0; j < path.length; j++) {
      const m = metres(path[j], [poi.location.lon, poi.location.lat, null]);
      if (m < bestM) [best, bestM] = [j, m];
    }
    // The ids lib/data.ts gives the trip page's places.
    return {
      id: `${trip.slug}:poi:${i}`,
      kind: poi.kind,
      icon: poiIcon(poi),
      out: cost[best] / total,
      back: loop ? null : cost[last2 - best] / total,
      // For lunch suggestions: the name, and the side trip there and back.
      name: poi.name,
      detour: poi.detour_min ?? 0,
    };
  });

  return {
    points: kept.map((k) => ({ ele: ele[order[k]], at: cost[k] / total, colour: colourOf(k), pos: [round5(path[order[k]][1]), round5(path[order[k]][0])] as [number, number] })),
    goalIndex: kept.indexOf(goalAt),
    goalName: trip.destination.name,
    goalKind: trip.destination.kind,
    loop,
    places,
  };
}

/** What the goal is called in the day's steps, and how "being there" reads. */
export const GOAL_WORDS: Record<DestinationKind, { noun: string; at: string }> = {
  vrchol: { noun: "vrchol", at: "Na vrchole" },
  vyhliadka: { noun: "vyhliadka", at: "Na vyhliadke" },
  hrad: { noun: "hrad", at: "Pri hrade" },
  chata: { noun: "chata", at: "Na chate" },
  pleso: { noun: "pleso", at: "Pri plese" },
  vodopad: { noun: "vodopád", at: "Pri vodopáde" },
  jaskyna: { noun: "jaskyňa", at: "Pri jaskyni" },
  roklina: { noun: "roklina", at: "V rokline" },
  ine: { noun: "cieľ", at: "V cieli" },
};

/**
 * The profile without the stretch skipped when joining the trail part-way:
 * `out` of the walking time cut from the start, `back` from the end.
 */
export function trimProfile(profile: TripProfile, out: number, back: number): TripProfile {
  const from = out;
  const to = 1 - back;
  if ((from <= 0 && to >= 1) || to - from <= 0.01) return profile;
  const pts = profile.points;
  const eleAt = (t: number): number => {
    const i = pts.findIndex((p) => p.at >= t);
    if (i <= 0) return pts[Math.max(0, i)].ele;
    const a = pts[i - 1];
    const b = pts[i];
    return a.ele + ((b.ele - a.ele) * (t - a.at)) / (b.at - a.at || 1);
  };
  const colourAt = (t: number) => pts.find((p) => p.at >= t)?.colour ?? null;
  const posAt = (t: number): [number, number] | undefined => {
    const i = pts.findIndex((p) => p.at >= t);
    const [a, b] = i <= 0 ? [pts[Math.max(0, i)], pts[Math.max(0, i)]] : [pts[i - 1], pts[i]];
    if (!a.pos || !b.pos) return undefined;
    const f = b.at > a.at ? (t - a.at) / (b.at - a.at) : 0;
    return [a.pos[0] + (b.pos[0] - a.pos[0]) * f, a.pos[1] + (b.pos[1] - a.pos[1]) * f];
  };
  const goal = pts[profile.goalIndex];
  const inside = pts.filter((p) => p.at > from && p.at < to);
  const points = [{ ele: eleAt(from), at: from, colour: colourAt(from), pos: posAt(from) }, ...inside, { ele: eleAt(to), at: to, colour: colourAt(to), pos: posAt(to) }].map(
    (p) => ({ ...p, at: (p.at - from) / (to - from) })
  );
  const goalAt = (goal.at - from) / (to - from);
  const goalIndex = Math.max(0, points.findIndex((p) => p.at >= goalAt - 1e-9));
  const keep = (at: number) => Math.min(1, Math.max(0, (at - from) / (to - from)));
  const places = profile.places?.map((p) => ({ ...p, out: keep(p.out), back: p.back === null ? null : keep(p.back) }));
  return { ...profile, points, goalIndex, places };
}

/**
 * The profile with the walk from the parking or stop to the trail before it and back after it,
 * `share` of the walking time each way: the goal comes that much later than on the trail alone.
 */
export function withApproach(profile: TripProfile, share: number): TripProfile {
  if (share <= 0 || share >= 0.5) return profile;
  const pts = profile.points;
  const scaled = pts.map((p) => ({ ...p, at: share + p.at * (1 - 2 * share) }));
  const first = { ele: pts[0].ele, at: 0, colour: null, pos: pts[0].pos };
  const last = { ele: pts[pts.length - 1].ele, at: 1, colour: null, pos: pts[pts.length - 1].pos };
  const move = (at: number) => share + at * (1 - 2 * share);
  const places = profile.places?.map((p) => ({ ...p, out: move(p.out), back: p.back === null ? null : move(p.back) }));
  return { ...profile, points: [first, ...scaled, last], goalIndex: profile.goalIndex + 1, places };
}

/**
 * The profile with the added stops as level stretches where the walk stands still: `hikeMin` is the
 * whole day on foot with the stops in, so the walking itself gets the rest of it.
 */
export function withStops(profile: TripProfile, stops: PauseAt[], hikeMin: number): TripProfile {
  const sorted = stops.filter((s) => s.min > 0).sort((a, b) => a.at - b.at);
  const stopShare = sorted.reduce((sum, s) => sum + s.min, 0) / Math.max(1, hikeMin);
  if (!sorted.length || stopShare >= 0.95) return profile;
  const walkShare = 1 - stopShare;
  const pts = profile.points;
  const eleAt = (at: number) => {
    const i = pts.findIndex((p) => p.at >= at);
    if (i <= 0) return pts[Math.max(0, i)].ele;
    const a = pts[i - 1];
    const b = pts[i];
    return a.ele + ((b.ele - a.ele) * (at - a.at)) / (b.at - a.at || 1);
  };
  const points: ProfilePoint[] = [];
  const pauses: NonNullable<TripProfile["pauses"]> = [];
  let goalIndex = 0;
  let next = 0;
  // Share of the day already spent standing at earlier stops.
  let stood = 0;
  const standUntil = (reached: (at: number) => boolean, colour: ProfilePoint["colour"]) => {
    for (; next < sorted.length && reached(sorted[next].at); next++) {
      const s = sorted[next];
      const from = s.at * walkShare + stood;
      stood += s.min / Math.max(1, hikeMin);
      const ele = eleAt(s.at);
      points.push({ ele, at: from, colour }, { ele, at: s.at * walkShare + stood, colour: null });
      pauses.push({ from, to: s.at * walkShare + stood, name: s.name, kind: s.kind, icon: s.icon });
    }
  };
  pts.forEach((p, i) => {
    standUntil((at) => at < p.at, p.colour);
    if (i === profile.goalIndex) goalIndex = points.length;
    points.push({ ...p, at: p.at * walkShare + stood });
    // A stop right at this point (lunch at the goal): arrive first, then stand.
    standUntil((at) => at <= p.at, null);
  });
  return { ...profile, points, goalIndex, pauses };
}
