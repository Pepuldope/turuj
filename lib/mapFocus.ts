"use client";

import type { LatLng } from "@/lib/types";

// "Show it on the map": a list row (a hut, a spring... on the trip page) asks the trip map to
// glide to that place and open its pin. The map listens; the list needs no handle on it.
const EVENT = "turuj-map-focus";

export interface MapFocus {
  /** The pin's id on the map (MapMarker.id), to open its label. */
  id: string;
  location: LatLng;
}

export function focusOnMap(target: MapFocus) {
  window.dispatchEvent(new CustomEvent<MapFocus>(EVENT, { detail: target }));
}

export function onMapFocus(cb: (target: MapFocus) => void): () => void {
  const listener = (e: Event) => cb((e as CustomEvent<MapFocus>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

// "Fit this step": on wide screens the page has one big map, and opening a plan step (or picking one of
// its options) asks it to frame that step's choice. Phones draw a small map inside the step instead.
export type MapFit = "routes" | "access" | "places";
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
