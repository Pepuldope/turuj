import type { Map as MlMap, Marker } from "maplibre-gl";
import type { MapFit } from "@/lib/mapFocus";

// Each route of a place is its own page (/trasa/<slug>), so a soft navigation between them unmounts
// the trip page's maps and mounts new ones: the visitor sees a map "reload". A map that is being
// unmounted is parked here for a moment, its container element detached from the page, and the map
// of the same place that mounts next picks it up instead of building a new one (components/TrailMap.tsx).
// Nothing is kept for long: a map nobody picks up within KEEP_MS is destroyed.

/** What the map's own event handlers call: re-pointed at the new component when a kept map is adopted. */
export interface KeptLive {
  select: (slug: string) => void;
  hover: (slug: string | null) => void;
  /** The owner wants hover events at all (the tap cursor is only set then). */
  hoverOn: () => boolean;
  markers: Marker[];
  markerIds: string[];
  userMarkers: Marker[];
}

export interface KeptMap {
  /** The map's container: MapLibre's canvas and controls live in it, the page's slot is just where it is attached. */
  el: HTMLDivElement;
  map: MlMap;
  ml: typeof import("maplibre-gl");
  live: KeptLive;
  /** The style and our layers are in place. */
  loaded: boolean;
  /** Called once when it gets loaded, by whoever owns the map at that time. */
  onLoad: (() => void) | null;
  /** Destroys the map for good. */
  dispose: () => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** A parked map not picked up by then is destroyed (opening another place, leaving the trip pages). */
const KEEP_MS = 5000;

const parked = new Map<string, KeptMap>();

/** The key of one map slot of one place: the big map, or the map of a plan step. */
export function keptMapKey(placeKey: string | undefined, focus: MapFit | undefined): string | undefined {
  return placeKey ? `${placeKey}:${focus ?? "big"}` : undefined;
}

/** Maps of each slot that are on screen right now: the next page renders before the last one unmounts. */
const shown = new Map<string, number>();

export function mapShown(key: string, on: boolean) {
  shown.set(key, Math.max(0, (shown.get(key) ?? 0) + (on ? 1 : -1)));
}

/** A map of this slot is parked or still on screen: the new page's map will take it over, so it needs no placeholder. */
export function hasKeptMap(key: string | undefined): boolean {
  return !!key && (parked.has(key) || (shown.get(key) ?? 0) > 0);
}

/** Parks a map that is being unmounted. */
export function keepMap(key: string, entry: KeptMap) {
  parked.get(key)?.dispose();
  entry.timer = setTimeout(() => {
    if (parked.get(key) === entry) parked.delete(key);
    entry.dispose();
  }, KEEP_MS);
  parked.set(key, entry);
}

/** Takes the parked map of this slot, if any (it is no longer parked). */
export function takeKeptMap(key: string | undefined): KeptMap | null {
  const entry = key ? (parked.get(key) ?? null) : null;
  if (!entry) return null;
  parked.delete(key!);
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  return entry;
}
