"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, GeoJSONSource, LineLayerSpecification, Map as MlMap, MapMouseEvent, Marker } from "maplibre-gl";
import type { LatLng } from "@/lib/types";
import type { DestinationKind } from "@/lib/tripSchema";
import { MAP_STYLE_URL, mapPixelRatio } from "@/lib/mapLayers";
import { keepInSlovakia } from "@/lib/slovakia";
import { GOAL_COLOUR, POPULARITY_DASH, POPULARITY_RAMP, POPULARITY_TOP_OUTLINE, QUIET_THREAD, desaturate } from "@/lib/palette";
import { lineFeeder, OVERVIEW_POINTS_PER_STEP } from "@/lib/mapFeed";
import { fetchLines } from "@/lib/packedLines";
import { attachTrailNetwork, cellsInView, LINE_TILE_MAX } from "@/lib/trailNetwork";
import { useUserLocation } from "@/lib/userLocation";
import { FALLBACK_STYLE, SLOVAKIA, hideBasePois } from "@/components/TrailMap";
import { PickPin } from "@/components/PickStartMap";
import { pageLang, tr } from "@/lib/lang";
import { mapLocale } from "@/lib/mapLocale";

type MapLibre = typeof import("maplibre-gl");
type Box = [number, number, number, number];

/** A trip as the home map needs it. */
export interface BrowseTrip {
  slug: string;
  goal: DestinationKind;
  rank: number;
  /** The goal (peak, waterfall...): where its square sits. */
  location: LatLng;
  start: LatLng;
  /** Not doable on the picked day: drawn in faint grey, under the others. */
  dim?: boolean;
  /** A yearly closure is in force on the picked day: washed out like `dim`, dashed, with a lock on its square. */
  closed?: boolean;
}

/** A mountain area: one dot while zoomed out. */
export interface BrowseArea {
  /** Matches the `id` of its outline in /data/map/areas.json. */
  id?: string;
  name: string;
  short: string;
  location: LatLng;
  bbox: Box;
}

/** A request to move the map; a new `key` moves it again. */
export type MapFocus =
  | { key: number; kind: "box"; bbox: Box; maxZoom?: number }
  | { key: number; kind: "point"; location: LatLng; zoom: number };

export interface MapView {
  /** [west, south, east, north] */
  bounds: Box;
  center: [number, number];
  zoom: number;
  /** Below this zoom the map shows areas instead of trips (lower on narrow screens). */
  areaZoom: number;
}

interface Props {
  /** The trips that pass the filters: their lines and squares. */
  trips: BrowseTrip[];
  areas: BrowseArea[];
  /** The areas' outlines (they split all of Slovakia), drawn while zoomed out. */
  outlines: GeoJSON.FeatureCollection | null;
  selected: string | null;
  /** The picked trip's other routes to the same place ([lon, lat] lines): drawn in slate, as on the trip page. */
  alternatives?: number[][][];
  /** A card hovered in the list: its line is outlined. */
  highlighted: string | null;
  focus: MapFocus | null;
  initialView: MapView | null;
  onView: (view: MapView) => void;
  /** Click or tap on a trip (its line or square); `also` = other trips under the pointer. */
  onPick: (pick: { slug: string; also: string[]; x: number; y: number } | null) => void;
  /** Pointer over a trip (mouse only). */
  onHover: (hover: { slug: string; x: number; y: number } | null) => void;
  /** Tap on a grey trail no trip uses: the trips closest to that spot. */
  onTrailTap: (tap: { nearby: { slug: string; km: number }[]; x: number; y: number }) => void;
  /** Phones keep the bottom of the map free for the preview. */
  bottomInset: number;
  /** Phones: start the map after the page has loaded and gone idle, or on the first scroll or touch (see whenUsed). */
  waitForUse?: boolean;
  ariaLabel: string;
}

// Whether the map may start: the visitor scrolled, touched or typed, or the page
// finished loading and sat idle (kept across pages).
let used = false;
const USE_EVENTS = ["scroll", "wheel", "touchstart", "pointerdown", "keydown"] as const;
/** After the page's load event: this long, then the first idle moment. */
const IDLE_START_MS = 5000;

/**
 * Calls `go` once the visitor does anything on the page, or once the page has
 * loaded and gone quiet. On phones the map (MapLibre drawing thousands of
 * lines) kept the page busy for seconds right after it opened, even though it
 * sits below the first screen; this way the page, its list and pictures come
 * first, and the map follows on its own (or sooner, with the first scroll).
 * No picture in its place meanwhile: an empty card that turns into a map shows
 * clearly when it can be used (Peter, 2026-11-03).
 */
function whenUsed(go: () => void): () => void {
  if (used) {
    go();
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const off = () => {
    USE_EVENTS.forEach((e) => window.removeEventListener(e, start, true));
    window.removeEventListener("load", afterLoad);
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
  };
  function start() {
    if (used) return;
    used = true;
    off();
    go();
  }
  function afterLoad() {
    timer = setTimeout(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(start, { timeout: 2000 });
      else start();
    }, IDLE_START_MS);
  }
  USE_EVENTS.forEach((e) => window.addEventListener(e, start, { capture: true, passive: true }));
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return off;
}

const MAP_DATA = "/data/map";
/**
 * The two quietest levels turn dotted/dashed only from here: below it their lines are
 * too thin for the dots to show, and they looked missing (Peter, 2026-10-26).
 */
const QUIET_DASH_ZOOM = 13;
/** Below this zoom the map shows areas; their squares come from here on. */
export const AREA_ZOOM = 9;
/**
 * How much earlier than on a wide screen areas give way to trips: a phone shows
 * a whole mountain area only around zoom 7.5, so its trips must show from there.
 */
export function areaShift(width: number): number {
  return Math.min(2, Math.max(0, Math.log2(1200 / Math.max(width, 1))));
}
/** Squares by popularity: the best known show from SQUARE_MIN, every trip by SQUARE_MAX. */
const SQUARE_MIN = AREA_ZOOM;
const SQUARE_MAX = 12;
/** Pixels between squares at the zoom where they first show. */
const SPACING = 54;
/** How far past the area zoom a new start zooms in: its surroundings, about an hour's drive across. */
const START_ZOOM_IN = 0.6;
/** Up to this many trips (a filter on), every one gets a square even zoomed out, a little bigger. */
const FEW_TRIPS = 300;
// How many zoom levels before the first squares show the map gets all of them (time to hand them over mid-zoom).
const SQUARE_EARLY = 1;
// Likewise for the overview's gap copy under the detailed lines (trip-lines-gap).
const GAP_EARLY = 1;
/** The overview and detailed trip lines overlap this many zoom levels each side of the area zoom, cross-fading. */
const LINE_HANDOVER = 0.5;
const SUN = "#ffb81c";
const AREA_LINE = "#1769d1";
const NIGHT = "#14233b";
const ramp = (colours: readonly string[]) =>
  ["match", ["get", "p"], ...colours.flatMap((c, i) => [i, c]), colours[0]] as unknown as ExpressionSpecification;
const RAMP = ramp(POPULARITY_RAMP);
/** Trips the picked day is too short for: the same colours, washed out. */
const DIM_RAMP = ramp(POPULARITY_RAMP.map((c) => desaturate(c)));

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const NO_LINES: number[][][] = [];
/** Other routes to the picked place: the trip page's slate (OTHER_ROUTE_COLOUR in TripMap). */
const ALT_ROUTE = "#6b7a93";

interface Meta {
  generated_at: string;
  grid: { lon0: number; lat0: number; dx: number; dy: number };
  cells: string[];
}

/** A rounded square path; ctx.roundRect is missing before Safari 16, and without the marks the map shows no trips. */
function roundSquare(g: CanvasRenderingContext2D, x: number, y: number, size: number, r: number) {
  if (typeof g.roundRect === "function") return g.roundRect(x, y, size, size, r);
  g.moveTo(x + r, y);
  g.arcTo(x + size, y, x + size, y + size, r);
  g.arcTo(x + size, y + size, x, y + size, r);
  g.arcTo(x, y + size, x, y, r);
  g.arcTo(x, y, x + size, y, r);
  g.closePath();
}

/** The site's square trail mark (16 px, white edge, soft shadow), drawn for the map at 2x. */
function squareImage(fill: string, edge: string, size: number, lock = false): ImageData {
  const r = 2;
  const pad = 3 * r;
  const s = size * r;
  const c = document.createElement("canvas");
  c.width = c.height = s + 2 * pad;
  const g = c.getContext("2d")!;
  g.shadowColor = "rgba(0,0,0,0.4)";
  g.shadowBlur = 3 * r;
  g.shadowOffsetY = 1 * r;
  g.fillStyle = edge;
  g.beginPath();
  roundSquare(g, pad, pad, s, 3 * r);
  g.fill();
  g.shadowColor = "transparent";
  g.fillStyle = fill;
  g.beginPath();
  roundSquare(g, pad + 2 * r, pad + 2 * r, s - 4 * r, 1.5 * r);
  g.fill();
  if (lock) {
    // A small padlock in the middle, for trips closed on the picked day.
    const mid = c.width / 2;
    g.strokeStyle = g.fillStyle = "#ffffff";
    g.lineWidth = 1.6 * r;
    g.beginPath();
    g.arc(mid, mid - 1.5 * r, 2.6 * r, Math.PI, 0);
    g.stroke();
    g.fillRect(mid - 4 * r, mid - 1 * r, 8 * r, 6 * r);
  }
  return g.getImageData(0, 0, c.width, c.height);
}

/**
 * The zoom at which each trip's square first shows: walk the levels up, place
 * trips best known first, and skip any closer than SPACING px to one already
 * placed. Popular trips take the space early; nothing regroups while zooming.
 */
function squareLevels(trips: BrowseTrip[], shift: number): Map<string, number> {
  const out = new Map<string, number>();
  const placed: BrowseTrip[] = [];
  // Greyed trips get a square only where the doable ones leave room.
  const sorted = [...trips].sort((a, b) => Number(!!a.dim) - Number(!!b.dim) || b.rank - a.rank);
  for (let z = SQUARE_MIN; z <= SQUARE_MAX; z++) {
    // Spacing is measured where the level shows: zoom z, moved earlier by shift on narrow screens.
    const world = 512 * 2 ** (z - shift);
    const px = (t: BrowseTrip): [number, number] => [
      ((t.location.lon + 180) / 360) * world,
      (0.5 - Math.log(Math.tan(Math.PI / 4 + (t.location.lat * Math.PI) / 360)) / (2 * Math.PI)) * world,
    ];
    const grid = new Map<string, [number, number][]>();
    const add = (t: BrowseTrip) => {
      const p = px(t);
      const k = `${Math.floor(p[0] / SPACING)},${Math.floor(p[1] / SPACING)}`;
      const list = grid.get(k);
      if (list) list.push(p);
      else grid.set(k, [p]);
    };
    placed.forEach(add);
    for (const t of sorted) {
      if (out.has(t.slug)) continue;
      const [x, y] = px(t);
      const cx = Math.floor(x / SPACING);
      const cy = Math.floor(y / SPACING);
      let free = true;
      if (z < SQUARE_MAX) {
        for (let i = -1; i <= 1 && free; i++)
          for (let j = -1; j <= 1 && free; j++)
            for (const p of grid.get(`${cx + i},${cy + j}`) ?? [])
              if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < SPACING * SPACING) free = false;
      }
      if (free) {
        out.set(t.slug, z);
        placed.push(t);
        add(t);
      }
    }
  }
  return out;
}

function showDots(els: HTMLElement[], on: boolean) {
  for (const el of els) el.style.display = on ? "" : "none";
}

const viewOf = (map: MlMap, shift: number): MapView => {
  const b = map.getBounds();
  const c = map.getCenter();
  return { bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], center: [c.lng, c.lat], zoom: map.getZoom(), areaZoom: AREA_ZOOM - shift };
};

const line = (coords: number[][] | undefined): GeoJSON.FeatureCollection =>
  coords && coords.length > 1
    ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] }
    : EMPTY;

/**
 * The home map: every trip as its own coloured line (by how well known it is)
 * over the whole marked-trail network in grey, so what you see is exactly what
 * a click selects. Zoomed out, one dot per mountain area; zoomed in, the trips'
 * square marks, the best known first. Lines load per area, for the view only.
 */
/**
 * Hides area names that would overlap a bigger area's dot or name. Areas come
 * biggest first and sit higher, so a big area is never hidden behind a small one.
 */
function declutter(els: HTMLElement[]) {
  const taken: DOMRect[] = [];
  const hits = (r: DOMRect) => taken.some((t) => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top);
  els.forEach((el, i) => {
    el.style.zIndex = String(els.length - i);
    const label = el.lastElementChild as HTMLElement;
    label.style.visibility = "";
    taken.push((el.firstElementChild as HTMLElement).getBoundingClientRect());
    const r = label.getBoundingClientRect();
    if (hits(r)) label.style.visibility = "hidden";
    else taken.push(r);
  });
}

export function BrowseMap({
  trips,
  areas,
  outlines,
  selected,
  alternatives = NO_LINES,
  highlighted,
  focus,
  initialView,
  onView,
  onPick,
  onHover,
  onTrailTap,
  bottomInset,
  waitForUse = false,
  ariaLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<{ ml: MapLibre; map: MlMap; shift: number } | null>(null);
  // Every line seen so far, by slug: the detailed one once its area has loaded.
  const lines = useRef(new Map<string, { coords: number[][]; detailed: boolean }>());
  const [linesVersion, setLinesVersion] = useState(0);
  const handlers = useRef({ onView, onPick, onHover, onTrailTap });
  const tripsRef = useRef(trips);
  const areasRef = useRef(areas);
  const areaEls = useRef<HTMLElement[]>([]);
  // Whether the hover outline and the picked trip are drawn now: an empty one needs no redraw.
  const hoverShown = useRef(false);
  const selShown = useRef(false);
  const altShown = useRef(false);
  const fewRef = useRef(false);
  // Squares: every trip's square, but the map only gets them all once you zoom near the level where they show.
  // Handing ~6,000 points to the map costs a second of a phone's main thread, for squares nobody sees yet.
  const squares = useRef<{ all: GeoJSON.Feature[]; full: boolean; sel: string | null }>({ all: [], full: false, sel: null });
  function pushSquares(map: MlMap, shift: number) {
    const sq = squares.current;
    // Far out only the big "few" squares and the chosen one can show.
    sq.full = map.getZoom() >= SQUARE_MIN - shift - SQUARE_EARLY;
    const features = sq.full ? sq.all : sq.all.filter((f) => f.properties?.f || (sq.sel && f.properties?.s === sq.sel));
    (map.getSource("squares") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  }
  const userMarkers = useRef<Marker[]>([]);
  // The start the map last moved to; undefined until the first one is seen.
  const startKey = useRef<string | null | undefined>(undefined);
  const { fix, start, picking, setPicking, pickPoint } = useUserLocation();
  const pickingRef = useRef(picking);
  // Picking with a mouse: where the click put the pin, waiting for "Tu začínam".
  const [pickAt, setPickAt] = useState<{ lat: number; lon: number } | null>(null);
  const initialRef = useRef(initialView);
  const waitRef = useRef(waitForUse);
  const insetRef = useRef(bottomInset);
  const zoomToAreaRef = useRef<(a: BrowseArea) => void>(() => {});
  // The "change the start?" card by the start pin: open, and where the pin is on screen.
  const [startMenu, setStartMenu] = useState(false);
  const [startXY, setStartXY] = useState<{ x: number; y: number } | null>(null);
  const hoverAreaRef = useRef<(id: string | null) => void>(() => {});

  useEffect(() => {
    handlers.current = { onView, onPick, onHover, onTrailTap };
    tripsRef.current = trips;
    areasRef.current = areas;
    insetRef.current = bottomInset;
    pickingRef.current = picking;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;
    let observer: ResizeObserver | null = null;
    let detachNetwork: (() => void) | null = null;
    let detachLimit: (() => void) | null = null;
    let shift = 0;
    let areaZoom = AREA_ZOOM;

    async function init() {
      const ml = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;
      shift = areaShift(containerRef.current.clientWidth);
      areaZoom = AREA_ZOOM - shift;
      const start = initialRef.current;
      map = new ml.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        ...(start ? { center: start.center, zoom: start.zoom } : { bounds: SLOVAKIA }),
        attributionControl: { compact: true },
        locale: mapLocale(pageLang()),
        dragRotate: false,
        pitchWithRotate: false,
        // Flat only: a two-finger drag on phones tilted the map into 3D by accident (Peter, 2026-10-24).
        touchPitch: false,
        maxPitch: 0,
        fadeDuration: 0,
        minZoom: 5,
        pixelRatio: mapPixelRatio(),
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");

      let styleFailed = false;
      map.on("error", (e) => {
        if (styleFailed || !map || map.isStyleLoaded() || !String(e.error?.message).includes(MAP_STYLE_URL)) return;
        styleFailed = true;
        map.setStyle(FALLBACK_STYLE);
      });

      map.on("load", () => {
        if (!map || cancelled) return;
        const m = map;
        hideBasePois(m);
        detachLimit = keepInSlovakia(m);
        // Every marked trail, faint grey: the trips are drawn over it in colour.
        detachNetwork = attachTrailNetwork(m, "context", POPULARITY_RAMP, POPULARITY_TOP_OUTLINE);

        // Area outlines: like districts on a map, they fade as the trips take over.
        m.addSource("areas", { type: "geojson", data: EMPTY, promoteId: "id" });
        m.addLayer({
          id: "area-fill",
          type: "fill",
          source: "areas",
          maxzoom: areaZoom + 0.5,
          paint: {
            "fill-color": AREA_LINE,
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], areaZoom - 0.6, ["case", ["boolean", ["feature-state", "hover"], false], 0.2, 0.06], areaZoom + 0.2, 0],
          },
        });
        m.addLayer({
          id: "area-line",
          type: "line",
          source: "areas",
          maxzoom: areaZoom + 0.5,
          layout: { "line-join": "round" },
          paint: {
            "line-color": AREA_LINE,
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.3, 9, 2],
            "line-opacity": ["interpolate", ["linear"], ["zoom"], areaZoom - 0.6, 0.7, areaZoom + 0.4, 0],
          },
        });

        const width = (a: number, b: number, c: number, extra = 0) =>
          [
            "interpolate", ["linear"], ["zoom"],
            // Zoomed out every trip still shows as a thin line, not only the busiest ones (Peter, 2026-10-22).
            6, ["+", 1 + extra, ["*", 0.3, ["get", "p"]]],
            9, ["+", 1.2 + extra, ["*", 0.4, ["get", "p"]]],
            // The quietest level gets a little extra so it stays visible, still thinner than orange.
            12, ["+", b + extra, ["*", 0.6, ["get", "p"]], ["case", ["==", ["get", "p"], 0], 0.35, 0]],
            15, ["+", c + extra, ["*", 0.8, ["get", "p"]], ["case", ["==", ["get", "p"], 0], 0.4, 0]],
          ] as unknown as ExpressionSpecification;
        const layout: LineLayerSpecification["layout"] = { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "r"] };
        // The overview and the detailed lines overlap by LINE_HANDOVER each side of areaZoom and
        // cross-fade there: a hard switch showed nothing for a moment while the map cut the new
        // source's first tiles, so the lines blinked when zooming in (Peter, 2026-11-04).
        const fade = (op: ExpressionSpecification | number, src: string) =>
          (src === "trip-lines"
            ? ["interpolate", ["linear"], ["zoom"], areaZoom, op, areaZoom + LINE_HANDOVER, 0]
            : ["interpolate", ["linear"], ["zoom"], areaZoom - LINE_HANDOVER, 0, areaZoom, op]) as unknown as ExpressionSpecification;
        for (const [src, range, tileMax] of [
          ["trip-lines", { maxzoom: areaZoom + LINE_HANDOVER }, Math.ceil(areaZoom + LINE_HANDOVER)],
          // A copy of the overview under the detailed lines, holding each trip only until its
          // detailed line is drawn, so zooming into an area for the first time never shows an
          // empty map for a moment. The overview itself stays whole for zooming back out.
          ["trip-lines-gap", { minzoom: areaZoom - LINE_HANDOVER }, Math.ceil(areaZoom)],
          ["trip-lines-d", { minzoom: areaZoom - LINE_HANDOVER }, LINE_TILE_MAX],
        ] as [string, { maxzoom?: number; minzoom?: number }, number][]) {
          m.addSource(src, { type: "geojson", data: EMPTY, maxzoom: tileMax });
          // The best known trips get a thin white edge, like on the trail network before.
          m.addLayer({ id: `${src}-top`, type: "line", source: src, ...range, filter: ["==", ["get", "p"], 4], layout, paint: { "line-color": POPULARITY_TOP_OUTLINE, "line-width": width(0.6, 1.4, 2.5, 1), "line-opacity": fade(0.9, src) } });
          // A thin dark thread under the two quietest (yellow) levels: on a white or pale road the yellow alone washes out.
          m.addLayer({ id: `${src}-thread`, type: "line", source: src, ...range, filter: ["<=", ["get", "p"], 1], layout, paint: { "line-color": QUIET_THREAD, "line-width": width(0.6, 1.4, 2.5, 1.2), "line-opacity": fade(0.4, src) } });
          // Closed on the picked day: the same washed-out line, dashed, under the others (the solid one is made invisible, but stays for taps).
          m.addLayer({ id: `${src}-closed`, type: "line", source: src, ...range, filter: ["==", ["get", "s"], ""], layout, paint: { "line-color": DIM_RAMP, "line-width": width(0.6, 1.4, 2.5), "line-opacity": fade(0.7, src), "line-dasharray": [2, 2] } });
          m.addLayer({ id: `${src}-line`, type: "line", source: src, ...range, layout, paint: { "line-color": RAMP, "line-width": width(0.6, 1.4, 2.5), "line-opacity": fade(["case", ["==", ["get", "p"], 0], 1, 0.95], src), "line-dasharray": ["step", ["zoom"], ["literal", [1, 0]], QUIET_DASH_ZOOM, POPULARITY_DASH] as unknown as ExpressionSpecification } });
          // Wide and invisible, so a thin line is easy to hit.
          m.addLayer({ id: `${src}-hit`, type: "line", source: src, ...range, paint: { "line-color": "#000", "line-width": 18, "line-opacity": 0 } });
        }

        m.addSource("alt", { type: "geojson", data: EMPTY, maxzoom: LINE_TILE_MAX });
        m.addLayer({ id: "alt-casing", type: "line", source: "alt", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.85 } });
        m.addLayer({ id: "alt-line", type: "line", source: "alt", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ALT_ROUTE, "line-width": 3.5 } });
        m.addSource("hover", { type: "geojson", data: EMPTY, maxzoom: LINE_TILE_MAX });
        m.addLayer({ id: "hover-line", type: "line", source: "hover", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": NIGHT, "line-width": 5, "line-opacity": 0.55 } });
        m.addSource("sel", { type: "geojson", data: EMPTY, maxzoom: LINE_TILE_MAX });
        m.addLayer({ id: "sel-casing", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 9 } });
        m.addLayer({ id: "sel-line", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": NIGHT, "line-width": 4.5 } });
        m.addSource("sel-start", { type: "geojson", data: EMPTY, maxzoom: LINE_TILE_MAX });
        m.addLayer({ id: "sel-start", type: "circle", source: "sel-start", paint: { "circle-color": "#ffffff", "circle-radius": 6, "circle-stroke-color": NIGHT, "circle-stroke-width": 3 } });

        // Squares: one layer per level, each fading in as its zoom is reached.
        for (const [kind, colour] of Object.entries(GOAL_COLOUR)) m.addImage(`sq-${kind}`, squareImage(colour, "#ffffff", 16), { pixelRatio: 2 });
        for (const [kind, colour] of Object.entries(GOAL_COLOUR)) m.addImage(`sq-dim-${kind}`, squareImage(desaturate(colour), "#ffffff", 16), { pixelRatio: 2 });
        for (const [kind, colour] of Object.entries(GOAL_COLOUR)) m.addImage(`sq-lock-${kind}`, squareImage(desaturate(colour), "#ffffff", 16, true), { pixelRatio: 2 });
        m.addImage("sq-active", squareImage(SUN, NIGHT, 22), { pixelRatio: 2 });
        m.addSource("squares", { type: "geojson", data: EMPTY });
        for (let z = SQUARE_MIN; z <= SQUARE_MAX; z++) {
          const fade = ["interpolate", ["linear"], ["zoom"], z - shift - 0.01, 0, z - shift + 0.15, 1] as unknown as ExpressionSpecification;
          m.addLayer({
            id: `sq-${z}`,
            type: "symbol",
            source: "squares",
            minzoom: z - shift - 0.01,
            filter: ["==", ["get", "z"], z],
            layout: { "icon-image": ["concat", ["case", ["get", "c"], "sq-lock-", ["get", "d"], "sq-dim-", "sq-"], ["get", "g"]], "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["-", 0, ["get", "r"]] },
            paint: { "icon-opacity": fade },
          });
        }
        // A filtered handful: every square from the overview on, until the levels take over.
        for (const [kind, colour] of Object.entries(GOAL_COLOUR)) m.addImage(`sq-big-${kind}`, squareImage(colour, "#ffffff", 20), { pixelRatio: 2 });
        m.addLayer({
          id: "sq-few",
          type: "symbol",
          source: "squares",
          maxzoom: SQUARE_MIN - shift,
          filter: ["==", ["get", "f"], true],
          layout: { "icon-image": ["concat", "sq-big-", ["get", "g"]], "icon-allow-overlap": true, "icon-ignore-placement": true, "symbol-sort-key": ["-", 0, ["get", "r"]] },
        });
        m.addLayer({
          id: "sq-active",
          type: "symbol",
          source: "squares",
          filter: ["==", ["get", "s"], ""],
          layout: { "icon-image": "sq-active", "icon-allow-overlap": true, "icon-ignore-placement": true },
        });

        bindEvents(m);
        loadLines(m);
        m.on("moveend", () => {
          loadLines(m);
          handlers.current.onView(viewOf(m, shift));
        });
        let lastZoomLoad = 0;
        // Mid-pinch and mid-drag too, so the detailed lines are there when the overview hands over
        // or a new area slides in (no blink; Peter 2026-11-05: worst on PC, bigger screen, faster wheel).
        m.on("move", () => {
          const now = performance.now();
          if (now - lastZoomLoad > 250) {
            lastZoomLoad = now;
            void loadLines(m);
          }
        });
        m.on("zoom", () => {
          showAreas(m.getZoom());
          void feedGap(m);
          if (!squares.current.full && m.getZoom() >= SQUARE_MIN - shift - SQUARE_EARLY) pushSquares(m, shift);
        });
        showAreas(m.getZoom());
        handlers.current.onView(viewOf(m, shift));
        setCtx({ ml, map: m, shift });
      });

      observer = new ResizeObserver(() => map?.resize());
      observer.observe(containerRef.current);
    }

    // ---- lines: the overview for the whole country, detailed areas as you look at them
    let meta: Meta | null = null;
    const loaded = new Set<string>();
    const pending = new Set<string>();
    const onMap = new Set<unknown>();
    const addLines = lineFeeder(() => map?.getSource("trip-lines-d") as GeoJSONSource | undefined);
    // Overview line ids by trip, and the trips whose detailed line is on the map but whose
    // overview line is not yet taken away (that waits until the detailed one is drawn).
    const overviewId = new Map<unknown, string | number>();
    const covered: unknown[] = [];
    // The gap copy shows only from the area zoom on, so the map gets it only when you zoom
    // towards it: one copy of the ~26,000 overview points fewer to hand over as the map opens.
    let gapFeatures: GeoJSON.Feature[] | null = null;
    let gapFed = false;
    const dropped: (string | number)[] = [];
    const gapSource = () => map?.getSource("trip-lines-gap") as GeoJSONSource | undefined;
    const dropCovered = () => {
      const m = map;
      if (!m || !covered.length) return;
      const ids = covered.splice(0).map((s) => overviewId.get(s)).filter((id) => id !== undefined);
      if (!gapFed) dropped.push(...ids);
      else if (ids.length) gapSource()?.updateData({ remove: ids }, true);
    };
    const feedGap = async (m: MlMap) => {
      if (gapFed || !gapFeatures || m.getZoom() < areaZoom - GAP_EARLY) return;
      gapFed = true;
      // The same features in the same order as the overview, so each trip gets the same id.
      await lineFeeder(gapSource, OVERVIEW_POINTS_PER_STEP)(gapFeatures);
      if (dropped.length && !cancelled) gapSource()?.updateData({ remove: dropped.splice(0) }, true);
    };
    const getJson = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url);
        return r.ok ? ((await r.json()) as T) : null;
      } catch {
        return null;
      }
    };
    const remember = (features: GeoJSON.Feature[], detailed: boolean) => {
      for (const f of features) {
        const slug = f.properties?.s as string;
        const known = lines.current.get(slug);
        if (known?.detailed && !detailed) continue;
        lines.current.set(slug, { coords: (f.geometry as GeoJSON.LineString).coordinates, detailed });
      }
      setLinesVersion((v) => v + 1);
    };
    // Once per map: the first load and an early "moveend" must not both fetch the
    // overview (and re-add lines that dropCovered already took away).
    let overviewP: Promise<Meta | null> | null = null;
    const loadOverview = (m: MlMap) =>
      (overviewP ??= (async () => {
        const got = await getJson<Meta>(`${MAP_DATA}/meta.json`);
        if (!got || cancelled) {
          overviewP = null;
          return null;
        }
        const overview = await fetchLines(`${MAP_DATA}/overview.json?v=${got.generated_at}`);
        if (overview && !cancelled) {
          lineFeeder(() => m.getSource("trip-lines") as GeoJSONSource | undefined, OVERVIEW_POINTS_PER_STEP)(overview.features);
          for (const f of overview.features) if (f.id !== undefined) overviewId.set(f.properties?.s, f.id);
          gapFeatures = overview.features;
          void feedGap(m);
          remember(overview.features, false);
        }
        return got;
      })());
    async function loadLines(m: MlMap) {
      if (!meta) {
        meta = await loadOverview(m);
        if (!meta || cancelled) return;
      }
      if (m.getZoom() < areaZoom - 1) return;
      const b = m.getBounds();
      const w = b.getEast() - b.getWest();
      const h = b.getNorth() - b.getSouth();
      const want = cellsInView(meta.grid, new Set(meta.cells), [b.getWest() - w * 0.3, b.getSouth() - h * 0.3, b.getEast() + w * 0.3, b.getNorth() + h * 0.3]);
      const todo = want.filter((k) => !loaded.has(k) && !pending.has(k));
      await Promise.all(
        todo.map(async (k) => {
          pending.add(k);
          const got = await fetchLines(`${MAP_DATA}/c/${k}.json?v=${meta!.generated_at}`);
          pending.delete(k);
          if (!got || cancelled) return;
          loaded.add(k);
          // A trip crossing two areas is in both files: keep it once.
          const add = got.features.filter((f) => !onMap.has(f.properties?.s));
          add.forEach((f) => onMap.add(f.properties?.s));
          // The overview lines go only once the map has taken every batch of the detailed ones
          // and drawn them ("idle"): dropped earlier, a trip had no line at all for a while (Peter, 2026-10-26).
          await addLines(add);
          if (cancelled) return;
          covered.push(...add.map((f) => f.properties?.s));
          m.once("idle", dropCovered);
          remember(got.features, true);
        })
      );
    }

    // ---- pointer
    const hitLayers = ["trip-lines-hit", "trip-lines-gap-hit", "trip-lines-d-hit"];
    const squareLayers = Array.from({ length: SQUARE_MAX - SQUARE_MIN + 1 }, (_, i) => `sq-${SQUARE_MIN + i}`);
    function under(m: MlMap, e: MapMouseEvent, r: number): string[] {
      const box: [[number, number], [number, number]] = [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]];
      const rank = (f: { properties: Record<string, unknown> }) => -(f.properties.r as number);
      const sq = m.queryRenderedFeatures(box, { layers: squareLayers }).sort((a, b) => rank(a) - rank(b));
      const ln = m.queryRenderedFeatures(e.point, { layers: hitLayers }).sort((a, b) => rank(a) - rank(b));
      return [...new Set([...sq, ...ln].map((f) => f.properties.s as string))];
    }
    const onGrey = (m: MlMap, e: MapMouseEvent, r: number) =>
      m.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], {
        layers: ["network-line", "network-detail-line"].filter((id) => m.getLayer(id)),
      }).length > 0;
    function nearby(lat: number, lon: number) {
      const k = Math.cos((lat * Math.PI) / 180);
      const shown = new Set(tripsRef.current.map((t) => t.slug));
      const out: { slug: string; km: number }[] = [];
      for (const [slug, { coords }] of lines.current) {
        if (!shown.has(slug)) continue;
        let d = Infinity;
        for (const [x, y] of coords) d = Math.min(d, ((x - lon) * k) ** 2 + (y - lat) ** 2);
        const km = Math.sqrt(d) * 111.2;
        if (km < 6) out.push({ slug, km });
      }
      return out.sort((a, b) => a.km - b.km).slice(0, 3);
    }
    let hoverArea: string | null = null;
    const setHoverArea = (m: MlMap, id: string | null) => {
      if (id === hoverArea) return;
      if (hoverArea) m.setFeatureState({ source: "areas", id: hoverArea }, { hover: false });
      hoverArea = id;
      if (id) m.setFeatureState({ source: "areas", id }, { hover: true });
    };
    const areaAt = (m: MlMap, e: MapMouseEvent): string | null =>
      (m.queryRenderedFeatures(e.point, { layers: ["area-fill"] })[0]?.properties?.id as string | undefined) ?? null;
    function bindEvents(m: MlMap) {
      const fine = window.matchMedia("(pointer: fine)").matches;
      let hovering: string | null = null;
      m.on("mousemove", (e) => {
        if (!fine) return;
        if (m.getZoom() < areaZoom) {
          const area = areaAt(m, e);
          setHoverArea(m, area);
          const any = area !== null || m.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: ["trip-lines-line"] }).length > 0;
          m.getCanvas().style.cursor = any ? "zoom-in" : "";
          if (hovering) handlers.current.onHover((hovering = null));
          return;
        }
        const found = under(m, e, 6);
        m.getCanvas().style.cursor = found.length || onGrey(m, e, 5) ? "pointer" : "";
        const slug = found[0] ?? null;
        if (slug !== hovering || slug) {
          hovering = slug;
          handlers.current.onHover(slug ? { slug, x: e.point.x, y: e.point.y } : null);
        }
      });
      m.on("mouseout", () => {
        setHoverArea(m, null);
        hovering = null;
        handlers.current.onHover(null);
      });
      m.on("click", (e) => {
        // A tap on the start house opens its own card (below), never a trip under it.
        if ((e.originalEvent.target as Element | null)?.closest?.("[data-start-pin]")) return;
        // "Vybrať bod na mape". With a mouse the click puts the pin there; on a touch screen the pin
        // stays in the middle and a tap brings that spot under it.
        if (pickingRef.current) {
          if (fine) return setPickAt({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          return void m.easeTo({ center: e.lngLat, duration: 400 });
        }
        const r = fine ? 6 : 14;
        // Zoomed out: a tap on any line zooms in there, so nothing is a dead end.
        if (m.getZoom() < areaZoom) {
          // A filtered handful shows squares even here: a tap on one picks that trip.
          const few = m.getLayer("sq-few")
            ? m.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], { layers: ["sq-few"] }).map((f) => f.properties?.s as string)
            : [];
          if (few.length) return handlers.current.onPick({ slug: few[0], also: few.slice(1, 4), x: e.point.x, y: e.point.y });
          // Inside an area: show all of it.
          const id = areaAt(m, e);
          const area = id ? areasRef.current.find((a) => a.id === id) : undefined;
          if (area) return zoomToArea(m, area);
          const any = m.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]], {
            layers: ["trip-lines-line", "network-line"].filter((id) => m.getLayer(id)),
          }).length;
          if (any) m.easeTo({ center: e.lngLat, zoom: areaZoom + 1.5 });
          return;
        }
        const found = under(m, e, r);
        if (found.length) {
          handlers.current.onPick({ slug: found[0], also: found.slice(1, 4), x: e.point.x, y: e.point.y });
          return;
        }
        if (onGrey(m, e, r)) {
          handlers.current.onTrailTap({ nearby: nearby(e.lngLat.lat, e.lngLat.lng), x: e.point.x, y: e.point.y });
          return;
        }
        handlers.current.onPick(null);
      });
    }

    function zoomToArea(m: MlMap, a: BrowseArea) {
      const cam = m.cameraForBounds([[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]], { padding: 24 });
      // The whole area in view; trips show from the area zoom on, so never stop short of it.
      m.easeTo({ center: cam?.center ?? [a.location.lon, a.location.lat], zoom: Math.max(cam?.zoom ?? 0, areaZoom + 0.05) });
    }
    zoomToAreaRef.current = (a) => map && zoomToArea(map, a);
    hoverAreaRef.current = (id) => map && setHoverArea(map, id);

    // ---- areas: HTML dots made once, shown or hidden by zoom (never rebuilt, so they don't blink)
    let declutterSoon: ReturnType<typeof setTimeout> | undefined;
    function showAreas(z: number) {
      for (const el of areaEls.current) el.style.display = z < areaZoom && !fewRef.current ? "" : "none";
      // Measuring the names makes the browser lay out the page, too slow for
      // every frame of a pinch: a few times a second is enough, and the last
      // check always comes after the zoom stops.
      if (z >= areaZoom || declutterSoon) return;
      declutterSoon = setTimeout(() => {
        declutterSoon = undefined;
        declutter(areaEls.current);
      }, 150);
    }

    // The map (MapLibre, the trail lines, the tiles) is the heaviest part of the
    // home. On phones it sits below the first screen, so start it only when it
    // comes near the screen (300 px): ready by the time it is scrolled to,
    // and nothing downloaded for visitors who never get there.
    let near: IntersectionObserver | null = null;
    function watchNear() {
      if (cancelled) return;
      if (typeof IntersectionObserver === "undefined" || !containerRef.current) {
        init();
        return;
      }
      near = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          near?.disconnect();
          near = null;
          init();
        },
        { rootMargin: "300px 0px" }
      );
      near.observe(containerRef.current);
    }
    // Coming back to the home page (a saved view) or a desktop: no waiting.
    const stopWaiting = waitRef.current && !initialRef.current ? whenUsed(watchNear) : (watchNear(), () => {});
    return () => {
      cancelled = true;
      stopWaiting();
      clearTimeout(declutterSoon);
      near?.disconnect();
      observer?.disconnect();
      detachNetwork?.();
      detachLimit?.();
      map?.remove();
      map = null;
      setCtx(null);
    };
  }, []);

  // Area dots.
  useEffect(() => {
    if (!ctx) return;
    const { ml, map } = ctx;
    const markers = areas.map((a) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mt-area";
      el.setAttribute("aria-label", tr(pageLang(), "{name}: priblížiť", { name: a.name }));
      el.innerHTML = `<span aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M2.5 19.5 9.5 7l3.4 5.6 2.1-3.1 6.5 10z" fill="currentColor"/></svg></span><span></span>`;
      (el.lastChild as HTMLElement).textContent = a.short;
      el.style.display = map.getZoom() < AREA_ZOOM - ctx.shift && !fewRef.current ? "" : "none";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        zoomToAreaRef.current(a);
      });
      if (a.id) {
        el.addEventListener("mouseenter", () => hoverAreaRef.current(a.id!));
        el.addEventListener("mouseleave", () => hoverAreaRef.current(null));
      }
      return new ml.Marker({ element: el, anchor: "top", offset: [0, -15] }).setLngLat([a.location.lon, a.location.lat]).addTo(map);
    });
    areaEls.current = markers.map((m) => m.getElement());
    requestAnimationFrame(() => declutter(areaEls.current));
    return () => {
      markers.forEach((m) => m.remove());
      areaEls.current = [];
    };
  }, [ctx, areas]);

  // Area outlines.
  useEffect(() => {
    if (!ctx) return;
    (ctx.map.getSource("areas") as GeoJSONSource | undefined)?.setData(outlines ?? EMPTY);
  }, [ctx, outlines]);

  // Which trips show: their lines and squares.
  useEffect(() => {
    if (!ctx) return;
    const { map } = ctx;
    const slugs = trips.map((t) => t.slug);
    const only = ["in", ["get", "s"], ["literal", slugs]] as unknown as ExpressionSpecification;
    const dim = ["in", ["get", "s"], ["literal", trips.filter((t) => t.dim).map((t) => t.slug)]] as unknown as ExpressionSpecification;
    const shut = ["in", ["get", "s"], ["literal", trips.filter((t) => t.closed).map((t) => t.slug)]] as unknown as ExpressionSpecification;
    for (const src of ["trip-lines", "trip-lines-gap", "trip-lines-d"]) {
      map.setFilter(`${src}-closed`, ["all", only, shut] as unknown as ExpressionSpecification);
      map.setFilter(`${src}-line`, only);
      map.setFilter(`${src}-hit`, only);
      map.setFilter(`${src}-top`, ["all", ["==", ["get", "p"], 4], only, ["!", dim]] as unknown as ExpressionSpecification);
      map.setFilter(`${src}-thread`, ["all", ["<=", ["get", "p"], 1], only, ["!", dim]] as unknown as ExpressionSpecification);
      map.setPaintProperty(`${src}-line`, "line-color", ["case", dim, DIM_RAMP, RAMP]);
      map.setPaintProperty(`${src}-line`, "line-opacity", ["case", shut, 0, dim, 0.8, ["==", ["get", "p"], 0], 1, 0.95]);
      // Washed-out lines go under the coloured ones.
      map.setLayoutProperty(`${src}-line`, "line-sort-key", ["case", dim, -1, ["get", "r"]]);
    }
    const level = squareLevels(trips, ctx.shift);
    const few = trips.filter((t) => !t.dim).length <= FEW_TRIPS;
    fewRef.current = few;
    // With every square showing, the area dots would only cover them.
    showDots(areaEls.current, !few && map.getZoom() < AREA_ZOOM - ctx.shift);
    squares.current.all = trips.map((t) => ({
      type: "Feature",
      properties: { s: t.slug, g: t.goal, r: t.rank, z: level.get(t.slug), d: !!t.dim, c: !!t.closed, f: few && !t.dim },
      geometry: { type: "Point", coordinates: [t.location.lon, t.location.lat] },
    }));
    squares.current.full = false;
    pushSquares(map, ctx.shift);
  }, [ctx, trips]);

  // The chosen trip: dark line, start dot, yellow square.
  useEffect(() => {
    if (!ctx) return;
    const { map } = ctx;
    const t = selected ? trips.find((x) => x.slug === selected) : undefined;
    // Nothing picked, before or now: no redraw for every change of the list or batch of lines.
    if (!selected && !selShown.current) return;
    selShown.current = !!selected;
    (map.getSource("sel") as GeoJSONSource | undefined)?.setData(line(selected ? lines.current.get(selected)?.coords : undefined));
    (map.getSource("sel-start") as GeoJSONSource | undefined)?.setData(
      t ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [t.start.lon, t.start.lat] } } : EMPTY
    );
    map.setFilter("sq-active", ["==", ["get", "s"], selected ?? ""]);
    squares.current.sel = selected;
    if (!squares.current.full) pushSquares(map, ctx.shift);
  }, [ctx, selected, trips, linesVersion]);

  // The picked trip's other routes.
  useEffect(() => {
    if (!ctx) return;
    if (!alternatives.length && !altShown.current) return;
    altShown.current = alternatives.length > 0;
    (ctx.map.getSource("alt") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: alternatives.map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } })),
    });
  }, [ctx, alternatives]);

  // Outline for a trip pointed at (on the map or in the list).
  useEffect(() => {
    if (!ctx) return;
    const coords = highlighted && highlighted !== selected ? lines.current.get(highlighted)?.coords : undefined;
    // Every batch of lines bumps linesVersion: an empty outline stays empty without a redraw.
    if (!coords && !hoverShown.current) return;
    hoverShown.current = !!coords;
    (ctx.map.getSource("hover") as GeoJSONSource | undefined)?.setData(line(coords));
  }, [ctx, highlighted, selected, linesVersion]);

  // Move when asked.
  useEffect(() => {
    if (!ctx || !focus) return;
    const { map } = ctx;
    const pad = { top: 40, left: 40, right: 40, bottom: 40 + insetRef.current };
    if (focus.kind === "box") {
      const [w, s, e, n] = focus.bbox;
      map.fitBounds([[w, s], [e, n]], { padding: pad, maxZoom: focus.maxZoom ?? 13 });
    } else {
      map.easeTo({ center: [focus.location.lon, focus.location.lat], zoom: focus.zoom });
    }
    // Only a new request (key) moves the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, focus?.key]);

  // Start pin (typed place) and "you are here" dot (GPS).
  useEffect(() => {
    if (!ctx) return;
    const { ml, map } = ctx;
    for (const m of userMarkers.current) m.remove();
    userMarkers.current = [];
    const pin = (cls: string, text: string, title: string) => {
      const el = document.createElement("div");
      el.className = `mt-pin ${cls}`;
      el.textContent = text;
      el.title = title;
      return el;
    };
    // The start's pin as a button: a tap (or Enter) opens "Chcete zmeniť, odkiaľ vyrážate?".
    const startButton = (dot: HTMLElement, label: string) => {
      dot.dataset.startPin = "";
      dot.style.pointerEvents = "auto";
      dot.style.cursor = "pointer";
      dot.setAttribute("role", "button");
      dot.tabIndex = 0;
      dot.setAttribute("aria-label", tr(pageLang(), "Štart: {name}. Zmeniť?", { name: label }));
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        setStartMenu((open) => !open);
      });
      dot.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        setStartMenu(true);
      });
    };
    if (start?.source === "manual") {
      const el = document.createElement("div");
      el.className = "mt-start";
      const dot = pin("mt-pin-start", "", start.label);
      dot.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3.5 11 12 4l8.5 7v9h-6v-5.5h-5V20h-6z" fill="currentColor"/></svg>';
      const name = document.createElement("span");
      name.className = "mt-start-name";
      name.textContent = start.label;
      el.append(dot, name);
      // Anchored on the house, with the name hanging below it.
      // Peter, 2026-11-11: the house no longer drags (too easy to move by accident while panning).
      // A tap opens a small card by it asking whether to change the start.
      startButton(dot, start.label);
      userMarkers.current.push(new ml.Marker({ element: el, anchor: "top", offset: [0, -18] }).setLngLat([start.lon, start.lat]).addTo(map));
    }
    // A new start (or the first one with no remembered view): show its surroundings, where the nearest trips are.
    const key = start ? `${start.lat.toFixed(4)},${start.lon.toFixed(4)}` : null;
    if (key && key !== startKey.current && (startKey.current !== undefined || !initialRef.current)) {
      map.easeTo({ center: [start!.lon, start!.lat], zoom: AREA_ZOOM - ctx.shift + START_ZOOM_IN, duration: startKey.current === undefined ? 0 : 900 });
    }
    startKey.current = key;
    if (fix) {
      const me = pin("mt-pin-me", "", tr(pageLang(), "Vaša poloha"));
      // Starting from where you are (no typed start): the blue dot is the start, so it opens the same card.
      if (start?.source === "gps") startButton(me, tr(pageLang(), "Vaša poloha"));
      userMarkers.current.push(new ml.Marker({ element: me }).setLngLat([fix.lon, fix.lat]).addTo(map));
    }
  }, [ctx, fix, start]);

  // Picking a start (Peter, 2026-10-29). Touch screens, as in Google Maps: a pin fixed in the middle
  // of the map, the map moves under it, "Tu začínam" takes the spot. With a mouse: a click puts the
  // pin down, and the button to confirm opens right by the pin, where the eye already is.
  const [finePointer, setFinePointer] = useState(false);
  const [pickXY, setPickXY] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinePointer(window.matchMedia("(pointer: fine)").matches);
  }, []);
  if (!picking && pickAt) setPickAt(null);
  useEffect(() => {
    if (!ctx || !pickAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPickXY(null);
      return;
    }
    const place = () => {
      const p = ctx.map.project([pickAt.lon, pickAt.lat]);
      setPickXY({ x: p.x, y: p.y });
    };
    place();
    ctx.map.on("move", place);
    return () => void ctx.map.off("move", place);
  }, [ctx, pickAt]);
  // The card by the start pin follows the pin while the map moves; a tap elsewhere, Escape, or a new
  // start closes it.
  const startAt = start?.source === "manual" || (start?.source === "gps" && fix) ? start : null;
  if ((!startAt || picking) && startMenu) setStartMenu(false);
  useEffect(() => {
    if (!ctx || !startMenu || !startAt) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStartXY(null);
      return;
    }
    const place = () => {
      const p = ctx.map.project([startAt.lon, startAt.lat]);
      setStartXY({ x: p.x, y: p.y });
    };
    place();
    const close = (e: MapMouseEvent) => {
      if (!(e.originalEvent.target as Element | null)?.closest?.("[data-start-pin]")) setStartMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStartMenu(false);
    ctx.map.on("move", place);
    ctx.map.on("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      ctx.map.off("move", place);
      ctx.map.off("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx, startMenu, startAt?.lat, startAt?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ctx) return;
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx, picking, setPicking]);

  // `isolate`: area dots stack among themselves only, never above the legend and buttons laid over the map.
  return (
    <div className="relative h-full w-full" data-browse-map="">
      <div ref={containerRef} className="isolate h-full w-full" role="region" aria-label={ariaLabel} />
      {startMenu && startXY && startAt && (
        // Above the house (its name hangs below it); under it when the house is near the top.
        <div
          role="dialog"
          aria-label={tr(pageLang(), "Zmeniť štart")}
          className={`mt-pick-card absolute z-[31] flex -translate-x-1/2 flex-col gap-2 rounded-xl bg-[var(--card-bg)] p-3 text-sm shadow-[var(--shadow-float)] ${startXY.y < 150 ? "translate-y-12" : "-translate-y-[calc(100%+30px)]"}`}
          style={{ left: startXY.x, top: startXY.y }}
        >
          <span className="max-w-[240px] font-semibold">{tr(pageLang(), "Chcete zmeniť, odkiaľ vyrážate?")}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStartMenu(false)} className="h-9 rounded-[10px] border border-[var(--border)] px-3.5 font-bold whitespace-nowrap">
              {tr(pageLang(), "Nie")}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setStartMenu(false);
                // On a touch screen the pick pin sits in the middle: start it from the current start.
                if (!finePointer) ctx?.map.easeTo({ center: [startAt.lon, startAt.lat], duration: 400 });
                setPicking(true);
              }}
              className="h-9 flex-1 rounded-[10px] bg-[var(--accent)] px-3.5 font-bold whitespace-nowrap text-[var(--accent-contrast)]"
            >
              {tr(pageLang(), "Zmeniť štart")}
            </button>
          </div>
        </div>
      )}
      {picking && !finePointer && (
        <>
          {/* The pin's tip is the middle of the map. */}
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-[30] -translate-x-1/2 -translate-y-full">
            <PickPin />
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-[29] h-1.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30" />
          <div
            role="status"
            className="absolute bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-14 z-[30] flex max-w-md flex-col gap-2.5 rounded-xl bg-[var(--card-bg)] p-3 text-sm shadow-[var(--shadow-float)]"
          >
            <span className="font-semibold">{tr(pageLang(), "Posuňte mapu tak, aby špendlík ukazoval, kde začínate.")}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPicking(false)} className="h-10 rounded-[10px] border border-[var(--border)] px-4 font-bold">
                {tr(pageLang(), "Zrušiť")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const c = ctx?.map.getCenter();
                  if (c) pickPoint(c.lat, c.lng);
                }}
                className="h-10 flex-1 rounded-[10px] bg-[var(--accent)] px-4 font-bold text-[var(--accent-contrast)]"
              >
                {tr(pageLang(), "Tu začínam")}
              </button>
            </div>
          </div>
        </>
      )}
      {picking && finePointer && (
        <>
          {pickAt && pickXY && (
            <>
              <div aria-hidden="true" className="pointer-events-none absolute z-[30] -translate-x-1/2 -translate-y-full" style={{ left: pickXY.x, top: pickXY.y }}>
                <PickPin />
              </div>
              {/* Right by the pin, so the confirm can't be missed; under it when the pin is near the top. */}
              <div
                className={`mt-pick-card absolute z-[31] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[var(--card-bg)] p-2 pl-3 text-sm shadow-[var(--shadow-float)] ${pickXY.y < 120 ? "translate-y-3" : "-translate-y-[calc(100%+52px)]"}`}
                style={{ left: pickXY.x, top: pickXY.y }}
              >
                <span className="font-semibold whitespace-nowrap">{tr(pageLang(), "Začínate tu?")}</span>
                <button
                  type="button"
                  autoFocus
                  onClick={() => pickPoint(pickAt.lat, pickAt.lon)}
                  className="h-9 rounded-[10px] bg-[var(--accent)] px-3.5 font-bold whitespace-nowrap text-[var(--accent-contrast)]"
                >
                  {tr(pageLang(), "Tu začínam")}
                </button>
              </div>
            </>
          )}
          <div
            role="status"
            className="absolute bottom-3 left-3 right-14 z-[30] flex max-w-md items-center gap-3 rounded-xl bg-[var(--accent)] px-3.5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] shadow-[var(--shadow-float)]"
          >
            <span className="min-w-0 flex-1">
              {pickAt ? tr(pageLang(), "Potvrďte pri špendlíku, alebo kliknite inam.") : tr(pageLang(), "Kliknite na mapu, kde začínate.")}
            </span>
            <button type="button" onClick={() => setPicking(false)} className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 font-bold">
              {tr(pageLang(), "Zrušiť")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The pin for picking a start; its tip is the bottom middle. */
