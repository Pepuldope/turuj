// Where the walk changes from one trail marking to another (Peter, 2026-10-29: "so that tourists
// know which one to follow on which part of the trip"). The map puts a small KST sign there.
import type { MarkColour, MarkingRun, TripDetail } from "@/lib/tripSchema";
import type { LatLng } from "@/lib/types";

/**
 * Runs shorter than this are noise: a few metres of road between two red stretches, a junction
 * drawn a step early. A fifth of the stored runs are under 50 m, and a sign for each would bury the map.
 */
export const MIN_RUN_M = 80;

export interface MarkSign {
  location: LatLng;
  /** The marking from here on, walking the way there (null = no marking). */
  colour: MarkColour | null;
  /** The marking before this point, which is the one to follow from here on the way back. */
  before: MarkColour | null;
}

/** A sign placed on the drawn line: in its piece `at` (from point `at` to the next one), `f` of the way along it (0 to 1). */
export interface SignOnLine {
  at: number;
  f?: number;
  location: LatLng;
  colour: MarkColour | null;
}

/**
 * The marking at one spot of the drawn line, on the way there. `pos` counts along the line's points: 3.5 is
 * halfway between points 3 and 4. It is what the last sign before that spot says, or the start's marking when
 * no sign came yet. A "no marking" sign (colour null) counts like any other: it was read as "no sign here", so
 * the unmarked stretch after it kept the colour of the start (Peter, 24 Nov 2026, C215: on Burianka the whole
 * line was blue).
 */
export function markingAt(signs: Pick<SignOnLine, "at" | "f" | "colour">[], start: MarkColour | null, pos: number): MarkColour | null {
  let colour = start;
  for (const s of signs) if (s.at + (s.f ?? 0) <= pos) colour = s.colour;
  return colour;
}

/** One stretch of the drawn line in one marking. `faint`: before or after the part really walked (parked up the trail). */
export interface LineRun {
  points: [number, number][];
  colour: MarkColour | null;
  faint: boolean;
}

/**
 * The drawn line ([lat, lon] points, in walking order) cut into stretches of one marking. The colour changes
 * exactly at each sign, not at the line's nearest bend: on a long straight piece the bend can be a few hundred
 * metres from the sign, and the grey "no marking" stretch then started well before its sign (C215).
 * Not a loop: the second half of the line is the way back over the same ground, so it mirrors the first.
 * `walked`: only the part between these two spots of the line is walked (`from` and `to` count like `pos`
 * above, `a` and `b` are the spots themselves); the rest comes back faint, and first, so it is drawn underneath.
 */
export function markingRuns(
  points: [number, number][],
  signs: SignOnLine[],
  start: MarkColour | null,
  loop: boolean,
  walked?: { from: number; to: number; a: [number, number]; b: [number, number] } | null
): LineRun[] {
  const last = points.length - 1;
  if (last < 1) return [];
  const up = loop ? last : Math.floor(last / 2);
  const cuts: { t: number; p: [number, number] }[] = [];
  for (const s of signs) {
    const t = s.at + (s.f ?? 0);
    const p: [number, number] = [s.location.lat, s.location.lon];
    cuts.push({ t, p });
    if (!loop) cuts.push({ t: last - t, p });
  }
  if (walked) cuts.push({ t: walked.from, p: walked.a }, { t: walked.to, p: walked.b });
  const spots = [
    ...points.map((p, t) => ({ t, p })),
    // A cut right on one of the line's own points needs no point of its own.
    ...cuts.filter((c) => c.t > 0 && c.t < last && Math.abs(c.t - Math.round(c.t)) > 1e-9),
  ].sort((x, y) => x.t - y.t);
  const runs: LineRun[] = [];
  let run: LineRun | null = null;
  for (let k = 0; k + 1 < spots.length; k++) {
    // Judged in the middle of the piece, so a piece that starts at a sign is clearly past it.
    const mid = (spots[k].t + spots[k + 1].t) / 2;
    const colour = markingAt(signs, start, loop || mid <= up ? mid : last - mid);
    const faint = !!walked && (mid < walked.from || mid > walked.to);
    if (!run || run.colour !== colour || run.faint !== faint) {
      run = { points: [spots[k].p], colour, faint };
      runs.push(run);
    }
    run.points.push(spots[k + 1].p);
  }
  return [...runs.filter((r) => r.faint), ...runs.filter((r) => !r.faint)];
}

type Pt = TripDetail["path"][number];

function metres(a: Pt, b: Pt): number {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111320);
}

interface Run {
  from: number;
  to: number;
  colour: MarkColour | null;
  m: number;
}

/** The runs with short ones folded into their neighbours, so only real changes are left. */
export function cleanRuns(path: Pt[], runs: MarkingRun[]): Run[] {
  const last = path.length - 1;
  const lengthOf = (from: number, to: number) => {
    let m = 0;
    for (let i = from; i < Math.min(to, last); i++) m += metres(path[i], path[i + 1]);
    return m;
  };
  const out: Run[] = runs
    .filter((r) => r.from <= last && r.to > r.from)
    .map((r) => ({ from: r.from, to: Math.min(r.to, last), colour: r.colour, m: lengthOf(r.from, r.to) }));
  // Two neighbours with the same marking are one run.
  const join = () => {
    for (let i = out.length - 1; i > 0; i--) {
      if (out[i].colour === out[i - 1].colour) {
        out[i - 1] = { ...out[i - 1], to: out[i].to, m: out[i - 1].m + out[i].m };
        out.splice(i, 1);
      }
    }
  };
  join();
  for (;;) {
    let k = -1;
    for (let i = 0; i < out.length; i++) if (out[i].m < MIN_RUN_M && (k < 0 || out[i].m < out[k].m)) k = i;
    if (k < 0 || out.length < 2) break;
    const prev = out[k - 1];
    const next = out[k + 1];
    // A short unmarked step between two markings: the new one starts where the old one ends.
    // A short marked one goes to its longer neighbour.
    const into = !next ? k - 1 : !prev ? k + 1 : out[k].colour === null || prev.m >= next.m ? k - 1 : k + 1;
    const r = out[into];
    out[into] = { ...r, from: Math.min(r.from, out[k].from), to: Math.max(r.to, out[k].to), m: r.m + out[k].m };
    out.splice(k, 1);
    join();
  }
  return out;
}

export interface MarkSigns {
  /** The marking the walk starts on. */
  start: MarkColour | null;
  signs: MarkSign[];
}

/** One sign at each point where the marking changes, the way the trip is stored (the way there). */
export function markSigns(trip: Pick<TripDetail, "path" | "marking_runs">): MarkSigns {
  const runs = cleanRuns(trip.path, trip.marking_runs);
  return {
    start: runs[0]?.colour ?? null,
    signs: runs.slice(1).map((r, i) => {
      const [lon, lat] = trip.path[r.from];
      return { location: { lat, lon }, colour: r.colour, before: runs[i].colour };
    }),
  };
}
