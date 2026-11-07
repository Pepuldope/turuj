/**
 * "Ďalšie výlety v okolí": the nearest other places to a trip, for the plain links on its page (C53).
 * The lists are not stored: a coarse grid over the trip index is built once per server instance (the
 * index is loaded anyway) and a page then looks at a handful of cells instead of all ~2,100 trips, so a
 * page drawn on a first visit costs a few dozen distance checks, and there is no extra data file to keep
 * in step with the weekly trip build.
 */
import { haversineM } from "@/lib/geo";
import type { LatLng } from "@/lib/types";
import type { TripSummary } from "@/lib/tripSchema";

/** Cell size in degrees: about 11 km north-south and 11 km east-west at Slovak latitudes. */
const CELL_LAT = 0.1;
const CELL_LON = 0.15;
/** The narrowest a cell is, metres: a search ring of r cells surely covers r times this in every direction. */
const CELL_MIN_M = 10800;
const MAX_RINGS = 40;

export interface Nearby {
  trip: TripSummary;
  /** Straight line from the given point to the trip's destination, metres. */
  m: number;
}

type Grid = Map<string, TripSummary[]>;
const grids = new WeakMap<readonly TripSummary[], Grid>();

const cellOf = (p: LatLng) => [Math.floor(p.lat / CELL_LAT), Math.floor(p.lon / CELL_LON)] as const;

function gridOf(mains: readonly TripSummary[]): Grid {
  let g = grids.get(mains);
  if (!g) {
    g = new Map();
    for (const t of mains) {
      const [r, c] = cellOf(t.destination.location);
      const key = `${r}:${c}`;
      const cell = g.get(key);
      if (cell) cell.push(t);
      else g.set(key, [t]);
    }
    grids.set(mains, g);
  }
  return g;
}

/**
 * The `n` nearest main trips to `from`, nearest first, leaving out the place `exclude` (its own main
 * slug, so its other routes and loops, which are not in `mains`, never show up as "other trips").
 * `mains` must be the same array between calls (the index's main trips) for the grid to be reused.
 */
export function nearestMainTrips(mains: readonly TripSummary[], from: LatLng, exclude: string, n: number): Nearby[] {
  const grid = gridOf(mains);
  const [r0, c0] = cellOf(from);
  const found: Nearby[] = [];
  for (let ring = 0; ring <= MAX_RINGS; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        for (const trip of grid.get(`${r0 + dr}:${c0 + dc}`) ?? []) {
          if (trip.slug !== exclude) found.push({ trip, m: haversineM(from, trip.destination.location) });
        }
      }
    }
    if (found.length >= n) {
      found.sort((a, b) => a.m - b.m);
      // Everything closer than `ring` cells has been seen: the nth one is final when it is that close.
      if (found[n - 1].m <= ring * CELL_MIN_M) break;
    }
  }
  found.sort((a, b) => a.m - b.m);
  return found.slice(0, n);
}

/** "6 km odtiaľto" distances: whole kilometres, "do 1 km" under one. */
export function roundKm(m: number): number {
  return Math.max(1, Math.round(m / 1000));
}
