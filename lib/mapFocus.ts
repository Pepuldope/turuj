"use client";

import type { LatLng } from "@/lib/types";

// "Show it on the map": a list row (a hut, a spring... on the trip page) asks the trip map to
// glide to that place and open its pin. The map listens; the list needs no handle on it.
const EVENT = "turuj-map-focus";

/** What a plan step's map frames: all the routes, the parking (or stops) on offer, the places on the way. */
export type MapFit = "routes" | "access" | "places";

export interface MapFocus {
  /** The pin's id on the map (MapMarker.id), to open its label. */
  id?: string;
  /** The item to centre on (a parking, a stop, a place). */
  location: LatLng;
  /** Which plan step's map answers: only that step's map on phones, the big map beside the page on desktop. Without it: the places map. */
  scope?: MapFit;
  /** Where the item meets the trail (the trailhead, the join point, the nearest path point): zoom just enough to show it too. */
  context?: LatLng;
  /** Instead of centring: fit these points (a route's two bounding corners). */
  fit?: LatLng[];
}

let last: { target: MapFocus; at: number } | null = null;

/** The latest request, if it is younger than `maxAgeMs`: a step map that mounts just after a pick (it was scrolled far away) replays it. */
export function recentFocus(maxAgeMs: number): MapFocus | null {
  return last && Date.now() - last.at < maxAgeMs ? last.target : null;
}

export function focusOnMap(target: MapFocus) {
  last = { target, at: Date.now() };
  window.dispatchEvent(new CustomEvent<MapFocus>(EVENT, { detail: target }));
}

export function onMapFocus(cb: (target: MapFocus) => void): () => void {
  const listener = (e: Event) => cb((e as CustomEvent<MapFocus>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// "Fit this step": on wide screens the page has one big map, and opening a plan step (or picking one of
// its options) asks it to frame that step's choice. Phones draw a small map inside the step instead.
const FIT_EVENT = "turuj-map-fit";

/** Only where the big map is (lg and up); phones' step maps frame themselves. */
export function fitOnMap(focus: MapFit) {
  if (typeof window === "undefined" || !window.matchMedia("(min-width: 1024px)").matches) return;
  window.dispatchEvent(new CustomEvent<MapFit>(FIT_EVENT, { detail: focus }));
}

export function onMapFit(cb: (focus: MapFit) => void): () => void {
  const listener = (e: Event) => cb((e as CustomEvent<MapFit>).detail);
  window.addEventListener(FIT_EVENT, listener);
  return () => window.removeEventListener(FIT_EVENT, listener);
}
