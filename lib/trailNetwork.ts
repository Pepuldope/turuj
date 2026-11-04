// Every marked hiking trail in Slovakia as a map layer (data: pipeline/network.py,
// public/data/trails). The country view draws ready-cut tiles of the light overview; zoomed in,
// the detailed file of each grid cell on screen is fetched once and added.
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { lineFeeder } from "@/lib/mapFeed";
import { fetchLines } from "@/lib/packedLines";
import { POPULARITY_DASH } from "@/lib/palette";

export type NetworkMode = "full" | "context";

/** Off until the all-trails map is approved from its preview; then every map shows the network. */
export const NETWORK_ON = true;

export interface TrailNetworkMeta {
  version: number;
  generated_at: string;
  grid: { lon0: number; lat0: number; dx: number; dy: number };
  cells: string[];
  levels: number;
  km: number;
}

const BASE = "/data/trails";
/** Deepest zoom line sources are cut into tiles at; closer views enlarge those. */
export const LINE_TILE_MAX = 14;
/** From this zoom on, the detailed cells replace the overview. */
export const DETAIL_ZOOM = 11;
/** Detailed cells are fetched from this many zoom levels before they show. */
const DETAIL_EARLY = 1;
/** Overview and detail overlap this many zoom levels each side of DETAIL_ZOOM, cross-fading. */
const HANDOVER = 0.5;
/** The overview tiles' zooms and box: keep in step with scripts/line-tiles.mjs. */
const NETWORK_TILE_MIN = 4;
const NETWORK_TILE_MAX = 10;
const NETWORK_BOUNDS: [number, number, number, number] = [16.8, 47.7, 22.6, 49.65];

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Grid cells ("ix_iy") that overlap a [west, south, east, north] box. */
export function cellsInView(
  grid: TrailNetworkMeta["grid"],
  available: Set<string>,
  [w, s, e, n]: [number, number, number, number]
): string[] {
  const out: string[] = [];
  const x0 = Math.floor((w - grid.lon0) / grid.dx);
  const x1 = Math.floor((e - grid.lon0) / grid.dx);
  const y0 = Math.floor((s - grid.lat0) / grid.dy);
  const y1 = Math.floor((n - grid.lat0) / grid.dy);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const key = `${x}_${y}`;
      if (available.has(key)) out.push(key);
    }
  }
  return out;
}

/**
 * Adds the network under whatever layers come after it. "full": coloured by
 * popularity (ramp, quiet to busy), busier also wider; the quietest level is
 * dotted and the busiest gets a thin outline. "context": one faint colour, so
 * the trip in focus stands out. Returns a cleanup function.
 */
export function attachTrailNetwork(
  map: MlMap,
  mode: NetworkMode,
  ramp: readonly string[],
  topOutline: string
): () => void {
  let stopped = false;
  // Lines are cut into tiles only down to the zoom they are shown at (the detail
  // to 14, enlarged beyond): less work for the phone at each zoom step.
  // The country view comes as ready-cut tiles (scripts/line-tiles.mjs) that the map's worker
  // fetches and reads itself: handed over as GeoJSON, its ~90,000 points froze a phone for
  // about half a second as the map appeared (Peter, 2026-11-03).
  map.addSource("network", {
    type: "vector",
    tiles: [`${window.location.origin}${BASE}/t/{z}/{x}/{y}.pbf`],
    minzoom: NETWORK_TILE_MIN,
    maxzoom: NETWORK_TILE_MAX,
    bounds: NETWORK_BOUNDS,
  });
  map.addSource("network-detail", { type: "geojson", data: EMPTY, maxzoom: LINE_TILE_MAX });

  const top = ramp.length - 1;
  const full = mode === "full";
  const colour = full
    ? (["match", ["get", "p"], ...ramp.flatMap((c, i) => [i, c]), ramp[0]] as unknown as string)
    : "#8a8f7a";
  const widthAt = (z7: number, z12: number, z15: number, extra = 0) =>
    [
      "interpolate",
      ["linear"],
      ["zoom"],
      7,
      ["+", z7 + extra, ["*", 0.35, ["get", "p"]]],
      12,
      ["+", z12 + extra, ["*", 0.6, ["get", "p"]]],
      15,
      ["+", z15 + extra, ["*", 0.8, ["get", "p"]]],
    ] as unknown as number;
  const width = widthAt(0.6, 1.4, 2.5);
  const baseOpacity = full ? 0.9 : 0.45;
  const layout = { "line-cap": "round", "line-join": "round" } as const;

  // The overview and the detailed cells overlap by HANDOVER on each side of DETAIL_ZOOM and
  // cross-fade there: a hard switch showed nothing for a moment while the map cut the detailed
  // source's first tiles at the new zoom, so the trails blinked when zooming in (Peter, 2026-11-04).
  const fade = (op: number, out: boolean) =>
    (out
      ? ["interpolate", ["linear"], ["zoom"], DETAIL_ZOOM, op, DETAIL_ZOOM + HANDOVER, 0]
      : ["interpolate", ["linear"], ["zoom"], DETAIL_ZOOM - HANDOVER, 0, DETAIL_ZOOM, op]) as unknown as number;
  for (const [prefix, source, minzoom, maxzoom, tiled, out] of [
    ["network", "network", 0, DETAIL_ZOOM + HANDOVER, { "source-layer": "network" }, true],
    ["network-detail", "network-detail", DETAIL_ZOOM - HANDOVER, 24, {}, false],
  ] as const) {
    const opacity = fade(baseOpacity, out);
    if (full) {
      // A hairline halo under the busiest trails, so the reddest read as "the main ones".
      map.addLayer({
        id: `${prefix}-top-outline`,
        type: "line",
        source,
        ...tiled,
        minzoom,
        maxzoom,
        filter: ["==", ["get", "p"], top],
        layout,
        paint: { "line-color": topOutline, "line-width": widthAt(0.6, 1.4, 2.5, 1), "line-opacity": opacity },
      });
      // The two quietest levels: thin, dotted then dashed.
      map.addLayer({
        id: `${prefix}-quiet`,
        type: "line",
        source,
        ...tiled,
        minzoom,
        maxzoom,
        filter: ["<=", ["get", "p"], 1],
        layout,
        paint: { "line-color": colour, "line-width": width, "line-opacity": opacity, "line-dasharray": POPULARITY_DASH as unknown as number[] },
      });
    }
    map.addLayer({
      id: `${prefix}-line`,
      type: "line",
      source,
      ...tiled,
      minzoom,
      maxzoom,
      ...(full ? { filter: [">", ["get", "p"], 1] as unknown as boolean } : {}),
      layout,
      paint: { "line-color": colour, "line-width": width, "line-opacity": opacity },
    });
  }

  let meta: TrailNetworkMeta | null = null;
  const loaded = new Set<string>();
  const pending = new Set<string>();
  // Each cell's lines are added to what the map already has, a few at a time.
  const addCell = lineFeeder(() => map.getSource("network-detail") as GeoJSONSource | undefined);

  async function loadVisibleCells() {
    if (stopped || !meta || map.getZoom() < DETAIL_ZOOM - DETAIL_EARLY) return;
    const b = map.getBounds();
    const want = cellsInView(meta.grid, new Set(meta.cells), [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    const todo = want.filter((k) => !loaded.has(k) && !pending.has(k));
    await Promise.all(
      todo.map(async (k) => {
        pending.add(k);
        const got = await fetchLines(`${BASE}/c/${k}.json?v=${meta!.generated_at}`);
        pending.delete(k);
        if (!got || stopped) return;
        loaded.add(k);
        addCell(got.features);
      })
    );
  }

  const onMove = () => void loadVisibleCells();
  map.on("moveend", onMove);
  // While a pinch is still going (no "moveend" yet), fetch the detailed cells on the way in,
  // so the overview doesn't hand over to empty space at DETAIL_ZOOM: the trails blinked (Peter, 2026-11-03).
  let lastZoomLoad = 0;
  const onZoom = () => {
    const now = performance.now();
    if (now - lastZoomLoad < 250) return;
    lastZoomLoad = now;
    void loadVisibleCells();
  };
  map.on("zoom", onZoom);

  (async () => {
    meta = await getJson<TrailNetworkMeta>(`${BASE}/meta.json`);
    if (!meta || stopped) return;
    loadVisibleCells();
  })();

  return () => {
    stopped = true;
    map.off("moveend", onMove);
    map.off("zoom", onZoom);
  };
}
