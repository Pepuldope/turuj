"use client";

import type { TripStop } from "@/lib/tripStops";
import { useCallback, useSyncExternalStore } from "react";
import type { Closure, LatLng } from "@/lib/types";
import type { TripProfile } from "@/lib/tripProfile";
import type { FixedRide } from "@/lib/dayPlan";
import type { Travel } from "@/lib/tripSettings";
import type { WalkTrip } from "@/lib/onTrail";
import type { BBox } from "@/lib/types";
import type { WeatherForecast } from "@/lib/weather";
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
  /** The forecast for the trip day, kept so the saved trip shows it offline; refreshed whenever the list loads a newer one. Missing on trips saved before it existed. */
  weather?: SavedWeather;
  /** Offline copy state: the page, GPX and map tiles. "none": the plan came from the account and this device has not made its offline copy yet. */
  offline: "ok" | "failed" | "pending" | "none";
  /** When the plan itself last changed on any device (ms); decides which copy wins in account sync. Missing on trips saved before sync existed (then savedAt counts). */
  changedAt?: number;
}

/** Fields that belong to one device and never travel with the account. */
export const DEVICE_FIELDS = ["offline", "eve", "weather"] as const;

/** When the plan last changed, for account sync. */
export const planAt = (trip: SavedTrip): number => trip.changedAt ?? (Date.parse(trip.savedAt) || 1);

/** A trip being saved: always newer than the copy it replaces, even if the clock went backwards. */
export function stampSave(trip: SavedTrip, prev: SavedTrip | undefined, now: number): SavedTrip {
  return { ...trip, changedAt: Math.max(now, (prev ? planAt(prev) : 0) + 1) };
}

/** Applies a change; the plan counts as changed only when a field that travels really got another value. */
export function stampPatch(trip: SavedTrip, change: Partial<SavedTrip>, now: number): SavedTrip {
  const next = { ...trip, ...change };
  const device = DEVICE_FIELDS as readonly string[];
  const before: Record<string, unknown> = { ...trip };
  const after: Record<string, unknown> = { ...next };
  const travels = Object.keys(change).some((k) => !device.includes(k) && k !== "changedAt" && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return travels ? { ...next, changedAt: Math.max(now, planAt(trip) + 1) } : next;
}

/** A saved trip's weather: where to ask for it and the last copy of the trip day's forecast. */
export interface SavedWeather {
  /** /api/weather at the trail start and up at the goal (null without a goal height). */
  url: string;
  topUrl: string | null;
  /** The trip day's steps (forecastForDay); null while the day was past the forecast's range. */
  below: WeatherForecast | null;
  above: WeatherForecast | null;
  /** When this copy was loaded (ISO); null while there is no copy. */
  at: string | null;
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
const GONE_KEY = "turuj-saved-gone";
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

let goneRaw: string | null = null;
let goneMap: Record<string, number> = {};

/** Slugs removed on this device and when; account sync sends them so the removal reaches the other devices. */
export function readSavedGone(): Record<string, number> {
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

export function writeSavedGone(map: Record<string, number>) {
  try {
    localStorage.setItem(GONE_KEY, JSON.stringify(map));
  } catch {
    // Storage full / blocked: the removal is then not sent to other devices.
  }
}

export const readSavedTrips = read;

/** Writes the list as given, no stamping (the sync engine decides what the stamps are). */
export function writeSavedTrips(list: SavedTrip[]) {
  write(list);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Asks the browser to keep this site's storage (the saved list, the offline pages and map tiles) when the
 * phone runs low on space; without it a browser may clear them by itself (C203). Chrome and Safari decide
 * without asking; Firefox asks the visitor, so there it is only called from a tap (saving a trip).
 */
export function keepStorage() {
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    // Old browser: nothing to ask.
  }
}

/** On page load: a device that already has saved trips (from before keepStorage existed, or refused once). */
export function keepStorageIfSaved() {
  if (read().length === 0 || /firefox|fxios/i.test(navigator.userAgent)) return;
  keepStorage();
}

export const tripCacheName = (slug: string) => `turuj-trip-${slug}`;

export function useSavedTrips() {
  const trips = useSyncExternalStore(subscribe, read, () => EMPTY);

  /** One saved entry per trail: saving again replaces it. Newest first. */
  const save = useCallback((trip: SavedTrip) => {
    const list = read();
    write([stampSave(trip, list.find((t) => t.slug === trip.slug), Date.now()), ...list.filter((t) => t.slug !== trip.slug)]);
    const gone = readSavedGone();
    if (trip.slug in gone) {
      const rest = { ...gone };
      delete rest[trip.slug];
      writeSavedGone(rest);
    }
    keepStorage();
  }, []);

  const patch = useCallback((slug: string, change: Partial<SavedTrip>) => {
    const now = Date.now();
    write(read().map((t) => (t.slug === slug ? stampPatch(t, change, now) : t)));
  }, []);

  const remove = useCallback(async (slug: string) => {
    const list = read();
    const trip = list.find((t) => t.slug === slug);
    if (trip) writeSavedGone({ ...readSavedGone(), [slug]: Math.max(Date.now(), planAt(trip) + 1) });
    write(list.filter((t) => t.slug !== slug));
    try {
      await caches.delete(tripCacheName(slug));
    } catch {
      // No Cache API (old browser / insecure context): only the record is removed.
    }
  }, []);

  return { trips, save, patch, remove };
}
