"use client";

import { useSyncExternalStore } from "react";
import type { SavedTrip } from "@/lib/savedTrips";
import "@/lib/legacyStorage";

/** "I was on this route": one entry per route and day, kept on every device of an account. */
export interface Visit {
  id: string;
  /** The place: the main trip's slug, what cards and pins look up. Empty when not known yet (a plan saved before visits existed); a later build fills it in from trip data. */
  slug: string;
  /** The route walked: its own trip slug, or `<slug>/okruh` for a loop. */
  route: string;
  name: string;
  /** "YYYY-MM-DD", "YYYY", "YYYY-sp" / "-su" / "-au" / "-wi" (year and season; winter counts to the year the person names) or "" when not known. */
  date: string;
  from: "plan" | "manual";
  /** When this entry last changed (ms); decides which copy wins in account sync. */
  at: number;
}

export interface VisitsData { visits: Visit[]; gone: Record<string, number> }

/** The same done trip gets the same id on every device, so it never turns into two visits. The route may contain a "/". */
export const planVisitId = (route: string, date: string) => `p:${route}:${date}`;

/** What a visit needs from a saved plan; `place` and `route` are missing on plans saved before visits existed. */
export interface PlanTrip { slug: string; name: string; date: string; place?: string; route?: string }

const routeOf = (trip: PlanTrip) => trip.route ?? trip.slug;

/** Adds the visit of a trip the group went on, unless it is there; clears a removal of it. */
export function addPlanVisit(data: VisitsData, trip: PlanTrip, at: number): VisitsData {
  const route = routeOf(trip);
  const id = planVisitId(route, trip.date);
  if (data.visits.some((v) => v.id === id)) return data;
  const gone = { ...data.gone };
  const goneAt = gone[id] ?? 0;
  delete gone[id];
  // Newer than the removal it undoes, even when the clock went backwards.
  const visit: Visit = { id, slug: trip.place ?? "", route, name: trip.name, date: trip.date, from: "plan", at: Math.max(at, goneAt + 1) };
  return { visits: [visit, ...data.visits], gone };
}

/** Removes the visit of a trip and records the removal so the other devices drop it too. */
export function removePlanVisit(data: VisitsData, trip: PlanTrip, now: number): VisitsData {
  const id = planVisitId(routeOf(trip), trip.date);
  const visit = data.visits.find((v) => v.id === id);
  if (!visit) return data;
  return { visits: data.visits.filter((v) => v.id !== id), gone: { ...data.gone, [id]: Math.max(now, visit.at + 1) } };
}

/** The visits of every saved trip that was marked done, added where missing. */
export function visitsOfDoneTrips(data: VisitsData, trips: SavedTrip[], now: number): VisitsData {
  let next = data;
  for (const trip of trips) if (trip.doneAt) next = addPlanVisit(next, trip, Date.parse(trip.doneAt) || now);
  return next;
}

const KEY = "turuj-visits";
const GONE_KEY = "turuj-visits-gone";
const MOVED_KEY = "turuj-visits-moved";
const EVENT = "turuj-visits";
const EMPTY: Visit[] = [];

let cachedRaw: string | null = null;
let cachedList: Visit[] = EMPTY;

export function readVisits(): Visit[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  // Same string -> same array, so useSyncExternalStore doesn't loop.
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Visit[]) : EMPTY;
    cachedList = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

export function writeVisits(list: Visit[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full / blocked: nothing we can do; the UI keeps the old list.
  }
  window.dispatchEvent(new Event(EVENT));
}

let goneRaw: string | null = null;
let goneMap: Record<string, number> = {};

export function readVisitsGone(): Record<string, number> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(GONE_KEY);
  } catch {
    return goneMap;
  }
  if (raw === goneRaw) return goneMap;
  goneRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    goneMap = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
  } catch {
    goneMap = {};
  }
  return goneMap;
}

export function writeVisitsGone(map: Record<string, number>) {
  try {
    localStorage.setItem(GONE_KEY, JSON.stringify(map));
  } catch {
    // Storage full / blocked: the removal is then not sent to other devices.
  }
}

function commit(before: VisitsData, after: VisitsData) {
  if (after.gone !== before.gone) writeVisitsGone(after.gone);
  if (after.visits !== before.visits) writeVisits(after.visits);
}

const current = (): VisitsData => ({ visits: readVisits(), gone: readVisitsGone() });

export function markVisited(trip: PlanTrip) {
  const before = current();
  commit(before, addPlanVisit(before, trip, Date.now()));
}

export function unmarkVisited(trip: PlanTrip) {
  const before = current();
  commit(before, removePlanVisit(before, trip, Date.now()));
}

/** Once per device: trips marked done before visits existed become visits. Safe to call again. */
export function moveDoneTripsToVisits() {
  try {
    if (localStorage.getItem(MOVED_KEY) === "1") return;
    const raw = localStorage.getItem("turuj-saved-trips");
    const trips = raw ? (JSON.parse(raw) as SavedTrip[]) : [];
    const before = current();
    commit(before, visitsOfDoneTrips(before, Array.isArray(trips) ? trips : [], Date.now()));
    localStorage.setItem(MOVED_KEY, "1");
  } catch {
    // Storage blocked: nothing to move, and nothing was marked as moved.
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useVisits() {
  const visits = useSyncExternalStore(subscribe, readVisits, () => EMPTY);
  return { visits };
}
