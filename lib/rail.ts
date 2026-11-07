// Real train connections from the national rail timetable (pipeline/rail.py,
// public/data/rail/timetable.json, refreshed weekly). The browser loads the
// timetable once and searches it itself, so the start never leaves the device.
//
// The search is a small round-based scan (the idea behind RAPTOR): round k
// knows the earliest arrival at every station with k trains; one pass over all
// of the day's trains in departure order extends it by one more train. Three
// rounds (two changes) cover every station-to-station trip in Slovakia.
import { haversineM } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

export interface RailTimetable {
  days: string[];
  agencies: string[];
  /** [name, lat, lon] */
  stations: [string, number, number][];
  services: string[];
  /** [label, name, agency, service, [station, arr, dep, ...]] */
  trips: [string, string, number, number, number[]][];
  feed_end?: string;
}

export interface RailLeg {
  /** "R 601", with the train's name when it has one ("R 601 Kriváň"). */
  train: string;
  from: string;
  to: string;
  /** Minutes after midnight of the trip's day. */
  dep: number;
  arr: number;
}

export interface RailJourney {
  legs: RailLeg[];
  /** First train leaves / last train arrives, minutes after midnight. */
  dep: number;
  arr: number;
  /** Where you get on and off, as indexes into the timetable's stations. */
  fromStation: number;
  toStation: number;
}

export interface StationNear {
  station: number;
  name: string;
  location: LatLng;
  distance_m: number;
}

/** Time to change trains at one station. */
const CHANGE_MIN = 4;
const ROUNDS = 3;

let ttP: Promise<RailTimetable | null> | null = null;

export function loadRailTimetable(): Promise<RailTimetable | null> {
  ttP ??= fetch("/data/rail/timetable.json")
    .then((r) => (r.ok ? (r.json() as Promise<RailTimetable>) : null))
    .catch(() => null);
  return ttP;
}

/** Index of an ISO date ("2026-10-14") in the timetable, -1 when not covered. */
export function dayIndex(tt: RailTimetable, isoDate: string): number {
  return tt.days.indexOf(isoDate.replaceAll("-", ""));
}

/**
 * The day the timetable changes ("13. 12.") when `isoDate` is after the file's last valid day, else null.
 * The last day is the feed's own calendar end (feed_end, else the last day it lists); a later day has
 * no real times, only the next timetable, which is not published yet.
 */
export function timetableChangeDay(tt: Pick<RailTimetable, "days" | "feed_end">, isoDate: string): string | null {
  const last = tt.feed_end ?? tt.days[tt.days.length - 1];
  if (!last || !/^\d{8}$/.test(last)) return null;
  const day = isoDate.replaceAll("-", "");
  if (day <= last) return null;
  const next = new Date(Date.UTC(+last.slice(0, 4), +last.slice(4, 6) - 1, +last.slice(6, 8) + 1));
  return `${next.getUTCDate()}. ${next.getUTCMonth() + 1}.`;
}

/** Stations within `maxM` of a point, nearest first. */
export function stationsNear(tt: RailTimetable, p: LatLng, maxM: number, limit = 3): StationNear[] {
  const out: StationNear[] = [];
  tt.stations.forEach(([name, lat, lon], station) => {
    const d = haversineM(p, { lat, lon });
    if (d <= maxM) out.push({ station, name, location: { lat, lon }, distance_m: Math.round(d) });
  });
  return out.sort((a, b) => a.distance_m - b.distance_m).slice(0, limit);
}

function trainLabel(tt: RailTimetable, t: RailTimetable["trips"][number]): string {
  const agency = tt.agencies[t[2]];
  const name = t[1] ? ` ${t[1].charAt(0)}${t[1].slice(1).toLowerCase()}` : "";
  return `${t[0]}${name}${agency && agency !== "ZSSK" ? ` (${agency})` : ""}`;
}

interface Label {
  arr: number;
  trip: number;
  board: number;
  alight: number;
  prev: number;
}

/**
 * The earliest arrival at any of `targets` (station -> extra minutes after
 * getting off, e.g. the walk) leaving one of `origins` (station -> earliest
 * time you can board there).
 */
export function earliestJourney(
  tt: RailTimetable,
  day: number,
  origins: Map<number, number>,
  targets: Map<number, number>
): RailJourney | null {
  if (day < 0) return null;
  const n = tt.stations.length;
  const best = new Float64Array(n).fill(Infinity);
  const rounds: (Label | null)[][] = [];
  let reached: Float64Array = new Float64Array(n).fill(Infinity);
  for (const [s, t] of origins) reached[s] = t;
  for (const [s, t] of origins) best[s] = t;

  for (let k = 0; k < ROUNDS; k++) {
    const labels: (Label | null)[] = new Array(n).fill(null);
    const next = new Float64Array(n).fill(Infinity);
    tt.trips.forEach((trip, ti) => {
      if (tt.services[trip[3]][day] !== "1") return;
      const st = trip[4];
      let board = -1;
      for (let i = 0; i < st.length; i += 3) {
        const s = st[i];
        if (board >= 0) {
          const arr = st[i + 1];
          if (arr < best[s] && arr < next[s]) {
            next[s] = arr;
            labels[s] = { arr, trip: ti, board, alight: i, prev: st[board] };
          }
        }
        // Board here if this round's predecessor reached the station in time (changing trains takes a while).
        const ready = reached[s] + (k > 0 ? CHANGE_MIN : 0);
        if (board < 0 && st[i + 2] >= ready) board = i;
      }
    });
    let improved = false;
    for (let s = 0; s < n; s++) {
      if (next[s] < best[s]) {
        best[s] = next[s];
        improved = true;
      }
    }
    rounds.push(labels);
    reached = next;
    if (!improved) break;
  }

  // The target with the earliest arrival plus its walk; fewer trains break ties.
  let bestEnd = Infinity;
  let end: { round: number; station: number } | null = null;
  rounds.forEach((labels, k) => {
    for (const [s, extra] of targets) {
      const l = labels[s];
      if (l && l.arr + extra < bestEnd) {
        bestEnd = l.arr + extra;
        end = { round: k, station: s };
      }
    }
  });
  if (!end) return null;

  const legs: RailLeg[] = [];
  let { round, station } = end as { round: number; station: number };
  let fromStation = station;
  while (round >= 0) {
    const l = rounds[round][station];
    if (!l) return null;
    const t = tt.trips[l.trip];
    const st = t[4];
    legs.unshift({ train: trainLabel(tt, t), from: tt.stations[st[l.board]][0], to: tt.stations[station][0], dep: st[l.board + 2], arr: l.arr });
    station = fromStation = l.prev;
    round--;
  }
  const first = legs[0];
  return { legs, dep: first.dep, arr: legs[legs.length - 1].arr, fromStation, toStation: (end as { station: number }).station };
}

/**
 * Up to `count` connections leaving at or after `earliest` (minutes): the
 * earliest arrival, then the earliest arrival leaving after that one, and so on.
 * Each origin carries its own access time (the walk or ride to that station).
 */
export function journeys(
  tt: RailTimetable,
  day: number,
  origins: { station: number; accessMin: number }[],
  targets: { station: number; extraMin: number }[],
  earliest: number,
  count = 3
): RailJourney[] {
  const out: RailJourney[] = [];
  const target = new Map(targets.map((t) => [t.station, t.extraMin]));
  let from = earliest;
  for (let i = 0; i < count; i++) {
    const origin = new Map(origins.map((o) => [o.station, from + o.accessMin]));
    const j = earliestJourney(tt, day, origin, target);
    if (!j) break;
    out.push(j);
    const access = origins.find((o) => o.station === j.fromStation)?.accessMin ?? 0;
    from = j.dep - access + 1;
  }
  return out;
}
