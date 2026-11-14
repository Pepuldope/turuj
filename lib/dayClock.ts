"use client";

import { useSyncExternalStore } from "react";
import { MARKING_COLOR } from "@/lib/mapLayers";
import type { DayPlan } from "@/lib/dayPlan";
import type { TripProfile } from "@/lib/tripProfile";

// The sun dial and the day map show the same day: the dial keeps the moment you scrub to, the map
// puts a walker where you are at that moment. This is the small channel between them: the dial
// publishes its moment, the plan publishes what the map needs to turn a moment into a place.

/** Trail stretches with no sign: the same slate the sun dial draws them in. */
export const UNMARKED_COLOUR = "#55627a";

/** What the day map needs to know about the plan (published by the plan, read by the map). */
export interface DayModel {
  /** The hike's start and end, ms: the same `plan.hikeStart` / `plan.hikeEnd` the dial and the times row use. */
  hs: number;
  he: number;
  /** The trail alone (skipped stretch cut), with map positions; the walk to it and the stops come on top. */
  trail: TripProfile | null;
  /** The walk from the parking (or stop) to the trail, as a share of the walking time each way (0 = none). */
  approach: number;
  /** Stretches of the day spent standing at the stops, as shares of the hike (TripProfile.pauses). */
  pauses: { from: number; to: number }[];
  /** When the walk reaches its goal, ms. */
  goalTime: number | null;
  /** Each stop's name and when you are there (once, or twice there and back), ms. */
  stops: { name: string; times: number[] }[];
  /** How you get to the walk's start: the car, the bus, the train, or you walk from the start. */
  mode: "car" | "bus" | "train" | "foot";
  /**
   * The ride from the start to the parking (or stop) and back, for the drive line on the day map: the start's
   * name, and when each ride runs (ms). Null without a start, or on foot.
   */
  ride?: { name: string; there: { from: number; to: number } | null; back: { from: number; to: number } | null } | null;
}

let model: DayModel | null = null;
let moment: number | null = null;
const modelListeners = new Set<() => void>();
const momentListeners = new Set<(t: number | null) => void>();

export function setDayModel(next: DayModel | null) {
  model = next;
  modelListeners.forEach((cb) => cb());
}

export function useDayModel(): DayModel | null {
  return useSyncExternalStore(
    (cb) => {
      modelListeners.add(cb);
      return () => modelListeners.delete(cb);
    },
    () => model,
    () => null
  );
}

/** The sun dial's moment now (ms), or null when it has gone. */
export function publishDayMoment(t: number | null) {
  if (t === moment) return;
  moment = t;
  momentListeners.forEach((cb) => cb(t));
}

export const dayMoment = () => moment;

export function onDayMoment(cb: (t: number | null) => void): () => void {
  momentListeners.add(cb);
  return () => momentListeners.delete(cb);
}

/** When the walk reaches its goal (peak, lake, castle...). */
export function goalTime(plan: DayPlan, profile: TripProfile): Date {
  const at = profile.points[profile.goalIndex].at;
  return new Date(plan.hikeStart.getTime() + at * (plan.hikeEnd.getTime() - plan.hikeStart.getTime()));
}

/** Where a moment puts you: at the ride's end (before and after the walk), on the walk to the trail and back, or on the trail. */
export type DayPlace =
  | { kind: "ride" }
  | { kind: "approach"; /** 0..1 along the walk from the car (or stop) to the trail. */ f: number; back: boolean }
  | { kind: "trail"; pos: [number, number] | null };

/**
 * The same walk the sun dial draws: a moment in the hike is a share of the day on foot (the dial's
 * x), and the walker stands where the profile is at that share. Standing at a stop holds the walk
 * still, the walk to the trail and back come first and last, the rest is the trail's own profile
 * (laid on the profile points' `at` as the dial does, so a steep stretch takes its time here too).
 */
export function dayPlace(m: DayModel, t: number): DayPlace {
  if (t < m.hs || t > m.he || !m.trail) return { kind: "ride" };
  const s = (t - m.hs) / (m.he - m.hs || 1);
  let stood = 0;
  let standing = 0;
  for (const p of m.pauses) {
    standing += p.to - p.from;
    if (s >= p.to) stood += p.to - p.from;
    else if (s > p.from) stood += s - p.from;
  }
  const u = Math.max(0, Math.min(1, (s - stood) / (1 - standing || 1)));
  const a = m.approach;
  if (a > 0 && u < a) return { kind: "approach", f: u / a, back: false };
  if (a > 0 && u > 1 - a) return { kind: "approach", f: (u - (1 - a)) / a, back: true };
  const v = a > 0 ? (u - a) / (1 - 2 * a) : u;
  const pts = m.trail.points;
  const i = Math.max(1, pts.findIndex((p) => p.at >= v));
  const [p0, p1] = [pts[i - 1], pts[i]];
  if (!p0?.pos || !p1?.pos) return { kind: "trail", pos: null };
  const f = Math.max(0, Math.min(1, (v - p0.at) / (p1.at - p0.at || 1)));
  return { kind: "trail", pos: [p0.pos[0] + (p1.pos[0] - p0.pos[0]) * f, p0.pos[1] + (p1.pos[1] - p0.pos[1]) * f] };
}

/**
 * The trail colours worth naming under the map: those of the day's picture (the sun dial's old legend,
 * moved here): a few metres of another colour at a junction would only puzzle, and what comes
 * after sunset isn't counted.
 */
export function trailColours(profile: TripProfile, hs: number, he: number, sunset: number): string[] {
  const share = new Map<string, number>();
  const w = profile.points;
  for (let i = 1; i < w.length; i++) {
    if (hs + w[i].at * (he - hs) > sunset) continue;
    const c = w[i].colour ? MARKING_COLOR[w[i].colour!] : UNMARKED_COLOUR;
    share.set(c, (share.get(c) ?? 0) + (w[i].at - w[i - 1].at));
  }
  const total = [...share.values()].reduce((x, y) => x + y, 0) || 1;
  return [...share].filter(([, len]) => len / total >= 0.05).map(([c]) => c);
}
