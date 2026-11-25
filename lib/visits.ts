"use client";

import { useSyncExternalStore } from "react";
import type { SavedTrip } from "@/lib/savedTrips";
import { whenKey } from "@/lib/visitWhen";
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

/**
 * Adds the visit of a trip the group went on, unless it is there; clears a removal of it. `date` is the day the
 * group confirmed when it is not the plan's day; the id keeps the plan's day, so the plan still finds its visit.
 */
export function addPlanVisit(data: VisitsData, trip: PlanTrip, at: number, date: string = trip.date): VisitsData {
  const route = routeOf(trip);
  const id = planVisitId(route, trip.date);
  if (data.visits.some((v) => v.id === id)) return data;
  const gone = { ...data.gone };
  const goneAt = gone[id] ?? 0;
  delete gone[id];
  // Newer than the removal it undoes, even when the clock went backwards.
  const visit: Visit = { id, slug: trip.place ?? "", route, name: trip.name, date, from: "plan", at: Math.max(at, goneAt + 1) };
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

/** What a visit added by hand carries; the day and the route are what the visitor picked, never filled in for them. */
export interface HandVisit { slug: string; route: string; name: string; date: string }

/** Adds a visit made by hand (no plan behind it). Its id is random, so two visits of one day stay two. */
export function addHandVisit(data: VisitsData, visit: HandVisit, id: string, at: number): VisitsData {
  if (data.visits.some((v) => v.id === id)) return data;
  return { visits: [{ id, ...visit, from: "manual", at }, ...data.visits], gone: data.gone };
}

/** Fixes a visit: another day or another route. Newer than the copy it replaces, so the fix wins in account sync. */
export function changeVisit(data: VisitsData, id: string, change: Partial<Pick<Visit, "date" | "route" | "slug">>, now: number): VisitsData {
  const visit = data.visits.find((v) => v.id === id);
  if (!visit) return data;
  const next = { ...visit, ...change };
  if (next.date === visit.date && next.route === visit.route && next.slug === visit.slug) return data;
  return { visits: data.visits.map((v) => (v.id === id ? { ...next, at: Math.max(now, visit.at + 1) } : v)), gone: data.gone };
}

/** Removes any visit by its id and records the removal so the other devices drop it too. */
export function removeVisit(data: VisitsData, id: string, now: number): VisitsData {
  const visit = data.visits.find((v) => v.id === id);
  if (!visit) return data;
  return { visits: data.visits.filter((v) => v.id !== id), gone: { ...data.gone, [id]: Math.max(now, visit.at + 1) } };
}

const LOOP = "/okruh";

/** The trip a route belongs to: a loop ("rysy/okruh") is walked from its own trip's page ("rysy"). */
export const routeTrip = (route: string): string => (route.endsWith(LOOP) ? route.slice(0, -LOOP.length) : route);

/** Whether a visit is of this place: by the place, or, for a visit that has no place yet, by one of the place's routes. */
const isAt = (visit: Visit, place: string, routes: readonly string[]): boolean =>
  visit.slug ? visit.slug === place : routes.includes(routeTrip(visit.route));

/** The visits of one place, the latest first. `routes` are the trip slugs of the place's routes. */
export function visitsAt(visits: readonly Visit[], place: string, routes: readonly string[]): Visit[] {
  return visits
    .filter((v) => isAt(v, place, routes))
    .sort((a, b) => (whenKey(a.date) === whenKey(b.date) ? b.at - a.at : whenKey(a.date) < whenKey(b.date) ? 1 : -1));
}

/** Gives the place to visits that have none yet (plans saved before visits existed), once their trip page is open. */
export function withPlace(data: VisitsData, place: string, routes: readonly string[], now: number): VisitsData {
  if (!data.visits.some((v) => !v.slug && routes.includes(routeTrip(v.route)))) return data;
  return { visits: data.visits.map((v) => (!v.slug && routes.includes(routeTrip(v.route)) ? { ...v, slug: place, at: Math.max(now, v.at + 1) } : v)), gone: data.gone };
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

/** `date`: the day the group confirmed, when they changed the plan's day in the window. */
export function markVisited(trip: PlanTrip, date?: string) {
  const before = current();
  commit(before, addPlanVisit(before, trip, Date.now(), date));
}

/** A visit ticked by hand on a trip page. Returns its id. */
export function addVisitByHand(visit: HandVisit): string {
  const id = `m:${crypto.randomUUID()}`;
  const before = current();
  commit(before, addHandVisit(before, visit, id, Date.now()));
  return id;
}

export function editVisit(id: string, change: Partial<Pick<Visit, "date" | "route">>) {
  const before = current();
  commit(before, changeVisit(before, id, change, Date.now()));
}

export function dropVisit(id: string) {
  const before = current();
  commit(before, removeVisit(before, id, Date.now()));
}

/** Called by a trip page once it knows its place and routes. Writes only when a visit was missing its place. */
export function fillPlace(place: string, routes: readonly string[]) {
  const before = current();
  commit(before, withPlace(before, place, routes, Date.now()));
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
