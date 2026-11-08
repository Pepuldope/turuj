"use client";

import type { TripStop } from "@/lib/tripStops";
import { useCallback, useSyncExternalStore } from "react";
import type { Closure, LatLng } from "@/lib/types";
import type { TripProfile } from "@/lib/tripProfile";
import type { FixedRide } from "@/lib/dayPlan";
import type { Travel } from "@/lib/tripSettings";
import type { WalkTrip } from "@/lib/onTrail";
import type { BBox } from "@/lib/types";
import "@/lib/legacyStorage";

/**
 * A saved trip: one trail + the day it's planned for, kept on this device only
 * (no accounts). Snapshots everything the saved-trips page needs, so it renders
 * offline without the trail database.
 */
export interface SavedTrip {
  slug: string;
  name: string;
  date: string;
  time: string;
  start: { lat: number; lon: number; label: string } | null;
  /** One-way ride at save time (drive, or bus/train); null without a start. */
  driveMin: number | null;
  /** Walking time as planned, kids pace and the walk from the parking or stop included. */
  hikeMin: number;
  /** The group's travel choice when saved, put back on Otvoriť; missing on trips saved before it existed. */
  travel?: Travel;
  /** The plan went by bus or train (the choice, or a start with no parking). */
  transit?: boolean;
  withKids?: boolean;
  /** Real train times the plan used, so the saved day shows the same times as the trip page. */
  fixed?: FixedRide | null;
  sun: LatLng;
  /** Height profile for the sun-arc picture; missing on trips saved before it existed. */
  profile?: TripProfile | null;
  /** The stops the group added (only a saved trip keeps them); put back on Otvoriť. */
  stops?: TripStop[];
  savedAt: string;
  /** When the group said they went (Bol som tu); missing while still planned. */
  doneAt?: string;
  /** "Ešte nie" on the trip page: don't ask "Boli ste na výlete?" again for this day. */
  skipAsk?: boolean;
  /** A quick review was sent for this trip from this browser. */
  reviewed?: boolean;
  /** The walk itself, for the trail screen ("Začať výlet"); missing on trips saved before it existed. */
  trail?: SavedTrail;
  /** The trail's closure rules at save time, so the list can warn about a closed day offline; missing on trips saved before it existed. */
  closures?: Closure[];
  /** The evening-before reminder (push): true on, false switched off by the group, missing until first offered. */
  eve?: boolean;
  /** Offline copy state: the page, GPX and map tiles. */
  offline: "ok" | "failed" | "pending";
}

/** What the trail screen needs to place a GPS fix on the walk, kept with the saved trip so it works offline. */
export interface SavedTrail extends WalkTrip {
  /** DIN walking time of the whole walk, minutes, no breaks (TripSummary.duration_min). */
  duration_min: number;
  goal: string;
  bbox: BBox | null;
}

const KEY = "turuj-saved-trips";
const EVENT = "turuj-saved-trips";
const EMPTY: SavedTrip[] = [];

let cachedRaw: string | null = null;
let cachedList: SavedTrip[] = EMPTY;

function read(): SavedTrip[] {
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
    const parsed = raw ? (JSON.parse(raw) as SavedTrip[]) : EMPTY;
    cachedList = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

function write(list: SavedTrip[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full / blocked: nothing we can do; the UI keeps the old list.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export const tripCacheName = (slug: string) => `turuj-trip-${slug}`;

export function useSavedTrips() {
  const trips = useSyncExternalStore(subscribe, read, () => EMPTY);

  /** One saved entry per trail: saving again replaces it. Newest first. */
  const save = useCallback((trip: SavedTrip) => {
    write([trip, ...read().filter((t) => t.slug !== trip.slug)]);
  }, []);

  const patch = useCallback((slug: string, change: Partial<SavedTrip>) => {
    write(read().map((t) => (t.slug === slug ? { ...t, ...change } : t)));
  }, []);

  const remove = useCallback(async (slug: string) => {
    write(read().filter((t) => t.slug !== slug));
    try {
      await caches.delete(tripCacheName(slug));
    } catch {
      // No Cache API (old browser / insecure context): only the record is removed.
    }
  }, []);

  return { trips, save, patch, remove };
}
