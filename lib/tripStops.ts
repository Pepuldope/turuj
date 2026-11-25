"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Poi, PoiKind } from "@/lib/types";

/**
 * Stops the group adds to a trip (a buffet, a viewpoint up a side path, a lunch break), kept per
 * trail on this device. Each stop carries its minutes, so the plan adds them without the place list.
 */
export interface TripStop {
  /** The place's id on the trip page ("<slug>:poi:<i>"), or LUNCH. */
  id: string;
  name: string;
  /** Side trip there and back plus the time spent there. */
  min: number;
  /** On a there-and-back walk: stop on the way there, on the way back, or both times. Unset = there. */
  way?: StopWay;
  /** LUNCH only: the clock time picked for it ("12:30"); unset = at the goal. */
  at?: string;
}

export type StopWay = "tam" | "spat" | "oboje";

/** How many times the walk passes the stop. */
export const visits = (s: TripStop) => (s.way === "oboje" ? 2 : 1);

export const LUNCH: TripStop = { id: "obed", name: "Obed", min: 30 };

/** Time spent at a place, on top of getting there. */
export const STAY_MIN: Record<PoiKind, number> = {
  obcerstvenie: 30,
  chata: 30,
  hrad: 30,
  utulna: 10,
  vyhliadka: 10,
  pramen: 5,
  ihrisko: 20,
};

export function stopFor(p: Poi): TripStop {
  return {
    id: p.id,
    name: p.name,
    min: (p.detour_min ?? 0) + STAY_MIN[p.kind],
  };
}

// Kept only while the group stays with one trip (Peter 2026-10-23: a saved trip keeps them, nothing else does),
// or can still step back to it with the back link (keepStopsOf).
const EVENT = "turuj-stops";
type All = Record<string, TripStop[]>;
const NONE: TripStop[] = [];

let all: All = {};

function readAll(): All {
  return all;
}

function write(next: All) {
  all = next;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Puts a trip's stops in place: a saved trip's on Otvoriť, none when the trip page closes. */
export function setTripStops(slug: string, stops: TripStop[]) {
  const { [slug]: _, ...rest } = readAll(); // eslint-disable-line @typescript-eslint/no-unused-vars
  write(stops.length ? { ...rest, [slug]: stops } : rest);
}

/**
 * A trip page opened: stops of other trips go, this trip's stay. So stepping over to the route
 * comparison and back keeps them (Peter, 2026-10-24), while the next trip starts empty.
 * `behind` are the trips the visitor can still step back to with the back link: theirs stay too, so
 * a look at a neighbour trip does not empty the plan they return to (Peter, 2026-11-25, C219).
 */
export function keepStopsOf(slug: string, behind: readonly string[] = []) {
  const now = readAll();
  const keep = Object.keys(now).filter((k) => k === slug || behind.includes(k));
  if (keep.length !== Object.keys(now).length) write(Object.fromEntries(keep.map((k) => [k, now[k]])));
}

/** Back on the trip list: every trip starts again without stops. */
export function clearAllStops() {
  if (Object.keys(readAll()).length) write({});
}

export const stopsMinutes = (stops: TripStop[]) =>
  stops.reduce((sum, s) => sum + s.min * visits(s), 0);

export function useTripStops(slug: string | null) {
  const stops = useSyncExternalStore(
    subscribe,
    () => (slug ? (readAll()[slug] ?? NONE) : NONE),
    () => NONE,
  );

  const toggle = useCallback(
    (stop: TripStop) => {
      if (!slug) return;
      const all = readAll();
      const now = all[slug] ?? [];
      const next = now.some((s) => s.id === stop.id)
        ? now.filter((s) => s.id !== stop.id)
        : [...now, stop];
      const { [slug]: _, ...rest } = all; // eslint-disable-line @typescript-eslint/no-unused-vars
      write(next.length ? { ...rest, [slug]: next } : rest);
    },
    [slug],
  );

  const setWay = useCallback(
    (id: string, way: StopWay) => {
      if (!slug) return;
      const all = readAll();
      write({ ...all, [slug]: (all[slug] ?? []).map((s) => (s.id === id ? { ...s, way } : s)) });
    },
    [slug],
  );

  /** Changes one stop (lunch's time). */
  const patch = useCallback(
    (id: string, change: Partial<TripStop>) => {
      if (!slug) return;
      const all = readAll();
      write({ ...all, [slug]: (all[slug] ?? []).map((s) => (s.id === id ? { ...s, ...change } : s)) });
    },
    [slug],
  );

  /** Lunch at a place: the place becomes the stop instead of the plain lunch break. */
  const lunchAt = useCallback(
    (stop: TripStop) => {
      if (!slug) return;
      const all = readAll();
      const rest = (all[slug] ?? []).filter((s) => s.id !== LUNCH.id && s.id !== stop.id);
      write({ ...all, [slug]: [...rest, stop] });
    },
    [slug],
  );

  const has = useCallback(
    (id: string) => stops.some((s) => s.id === id),
    [stops],
  );
  return { stops, toggle, setWay, patch, lunchAt, has, minutes: stopsMinutes(stops) };
}
