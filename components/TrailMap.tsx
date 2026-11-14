"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker, Popup, StyleSpecification } from "maplibre-gl";
import type { BBox, LatLng } from "@/lib/types";
import { MAP_STYLE_URL, mapPixelRatio } from "@/lib/mapLayers";
import { onMapFocus, recentFocus } from "@/lib/mapFocus";
import type { MapFocus } from "@/lib/mapFocus";
import type { MapFit } from "@/lib/mapFocus";
import { keepInSlovakia } from "@/lib/slovakia";
import { UI_ICON } from "@/lib/uiIcons";
import { POPULARITY_RAMP, POPULARITY_TOP_OUTLINE } from "@/lib/palette";
import { attachTrailNetwork } from "@/lib/trailNetwork";
import type { NetworkMode } from "@/lib/trailNetwork";
import { useUserLocation } from "@/lib/userLocation";
import { pageLang, tr } from "@/lib/lang";
import { mapLocale } from "@/lib/mapLocale";
import { keepMap, mapShown, takeKeptMap } from "@/lib/keptMap";
import type { KeptLive, KeptMap } from "@/lib/keptMap";

type MapLibre = typeof import("maplibre-gl");

export type TrackState = "normal" | "selected" | "dimmed";

export interface MapTrack {
  slug: string;
  /** The trail's name, kept on the map feature. */
  label?: string;
  points: [number, number][];
  /** Line colour: the trail's KST marking (lib/mapLayers trackColor). */
  color: string;
  state: TrackState;
  /** Arrows along the line in walking order: a loop reads differently clockwise and back (Peter, 2026-10-29). */
  arrows?: boolean;
}

/** The way off the trail to an added stop and back, in the place's own colour. */
export interface SideLeg {
  points: [number, number][];
  colour: string;
}


export type MarkerKind = "trailhead" | "parking" | "transit-autobus" | "transit-elektricka" | "transit-vlak" | "poi" | "goal" | "mark" | "me";

export interface MapMarker {
  id: string;
  kind: MarkerKind;
  location: LatLng;
  title: string;
  /** Extra popup lines (plain text). */
  lines?: string[];
  dimmed?: boolean;
  active?: boolean;
  /** Clicking the marker selects this trail (home page). */
  trailSlug?: string;
  /** Clicking the marker runs this (e.g. pick this parking). */
  onClick?: () => void;
  /** Pin colour and pictogram (places on the way), instead of the kind's default look. */
  colour?: string;
  icon?: string;
  /** A button in the popup (a place on the way: add it as a stop). */
  action?: { label: string; onClick: () => void };
  /** A short text by the pin, always shown (the day map: the time you are there). */
  label?: string;
  /** Which side of the pin the label sits on (default right). */
  labelSide?: "left" | "right";
}

interface Props {
  tracks: MapTrack[];
  markers: MapMarker[];
  /** The map re-fits to this box whenever it changes. */
  bounds: BBox | null;
  /** Changes to fit `bounds` again although the box itself stayed the same (a plan step opened again). */
  refit?: number | string;
  /** Which plan step this map belongs to: it answers only "show it on the map" events of that scope (lib/mapFocus.ts). The big map has none and answers all. */
  scope?: MapFit;
  /** The frame of a step's default view: the least zoomed-out a centred pick may be. */
  focusFloor?: (scope?: MapFit) => BBox | null;
  /** On first view, centre on this (a parking picked earlier) instead of fitting `bounds`. */
  openOn?: { location: LatLng; context?: LatLng };
  onSelectTrail?: (slug: string) => void;
  /** The pointer moved onto a track (its slug) or off every track (null). */
  onHoverTrail?: (slug: string | null) => void;
  /** Drive from the trip's start to the parking, drawn dashed under the trail. */
  driveLeg?: [number, number][];
  /** On foot from where the car stops to the trail start, drawn dotted. */
  walkLeg?: [number, number][];
  /** Side trips off the trail to the stops the group added, drawn dashed in the site blue. */
  sideLegs?: SideLeg[];
  /** Every marked trail in Slovakia under ours: "full" coloured by popularity, "context" faint. */
  network?: NetworkMode;
  ariaLabel: string;
  className?: string;
  /**
   * Keeps this map alive across a soft navigation: while it unmounts it is parked under this key, and the map
   * that mounts next with the same key takes it over (lib/keptMap.ts). The routes of one place share the key.
   */
  persistKey?: string;
  /** Adds its own layer to the map once it is ready (the day map's walker); returns what removes it. Keep the function stable: a new one re-adds the layer. */
  onMap?: (ml: MapLibre, map: MlMap) => (() => void) | void;
}

const MARKER_GLYPH: Record<MarkerKind, string> = {
  trailhead: "",
  parking: "P",
  "transit-autobus": "",
  "transit-elektricka": "",
  "transit-vlak": "",
  poi: "*",
  goal: "",
  mark: "",
  me: "",
};

const pictogram = (svg: string) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${svg}</svg>`;

/** Stops show the bus or train, as in the rest of the page. */
const MARKER_ICON: Partial<Record<MarkerKind, string>> = {
  "transit-autobus": pictogram(UI_ICON.bus),
  "transit-elektricka": pictogram(UI_ICON.bus),
  "transit-vlak": pictogram(UI_ICON.train),
};

/**
 * The base map's own points of interest (shops, stops, peaks, parkings...)
 * would double ours: hide them and keep only our pins. Place, road and water
 * names stay.
 */
const BASE_POI_SOURCE_LAYERS = new Set(["poi", "mountain_peak", "aerodrome_label"]);

export function hideBasePois(map: MlMap) {
  for (const layer of map.getStyle()?.layers ?? []) {
    const sourceLayer = (layer as { "source-layer"?: string })["source-layer"];
    if (layer.type === "symbol" && sourceLayer && BASE_POI_SOURCE_LAYERS.has(sourceLayer)) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

const MARKER_CLASS: Record<MarkerKind, string> = {
  trailhead: "mt-pin-trailhead",
  parking: "mt-pin-parking",
  "transit-autobus": "mt-pin-transit",
  "transit-elektricka": "mt-pin-transit",
  "transit-vlak": "mt-pin-transit",
  poi: "mt-pin-poi",
  goal: "mt-pin-goal",
  mark: "mt-pin-mark",
  me: "mt-pin-me",
};

export const SLOVAKIA: [[number, number], [number, number]] = [
  [16.8, 47.7],
  [22.6, 49.6],
];
const FIT_PADDING = 32;

/** [lat, lon] (our data) -> [lon, lat] (GeoJSON / MapLibre). */
const lngLat = (p: [number, number]): [number, number] => [p[1], p[0]];

function popupContent(title: string, lines: string[] = [], action?: MapMarker["action"]): HTMLElement {
  const el = document.createElement("div");
  const h = document.createElement("strong");
  h.textContent = title;
  el.appendChild(h);
  for (const line of lines) {
    const p = document.createElement("div");
    p.textContent = line;
    el.appendChild(p);
  }
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mt-popup-action";
    b.textContent = action.label;
    b.addEventListener("click", action.onClick);
    el.appendChild(b);
  }
  return el;
}

/** Space kept between an open popup and the map's border, px (the bottom one clears the attribution button). */
/** Half the size of a pin, px (the active ones are 30 wide). */
const PIN_HALF = 16;
const POPUP_PAD = { top: 12, right: 12, bottom: 30, left: 12 };

/**
 * A place's popup, always whole inside the map frame: no wider than the map, and the map pans by just enough
 * to bring all of it (the "+" button last) into view. MapLibre picks the side the popup opens to, but it can't
 * see the zoom buttons or a short map, and its own pan-to-fit is off.
 */
function keepPopupInView(map: MlMap, popup: Popup) {
  const fitOnce = (pass: number) => {
    const el = popup.getElement();
    if (!el || !popup.isOpen()) return;
    const box = map.getContainer().getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // The place's own pin counts too: the popup and the pin must be in view together.
    const at = map.project(popup.getLngLat());
    const pin = { left: box.left + at.x - PIN_HALF, right: box.left + at.x + PIN_HALF, top: box.top + at.y - PIN_HALF, bottom: box.top + at.y + PIN_HALF };
    const lo = { x: box.left + POPUP_PAD.left, y: box.top + POPUP_PAD.top };
    const hi = { x: box.right - POPUP_PAD.right, y: box.bottom - POPUP_PAD.bottom };
    // Per axis: the least shift that brings both in; when they can't both fit, the pin stays in (and the popup's far
    // edge, where the "+" button is, as far as that allows).
    const shift = (min: number, max: number, pMin: number, pMax: number, loE: number, hiE: number, keepFar: boolean) => {
      const uMin = Math.min(min, pMin);
      const uMax = Math.max(max, pMax);
      let d = 0;
      if (uMax - uMin <= hiE - loE) d = uMin < loE ? loE - uMin : uMax > hiE ? hiE - uMax : 0;
      else d = keepFar ? hiE - uMax : loE - uMin;
      // The pin never leaves the frame.
      if (pMin + d < loE) d = loE - pMin;
      if (pMax + d > hiE) d = hiE - pMax;
      return d;
    };
    const dx = shift(r.left, r.right, pin.left, pin.right, lo.x, hi.x, false);
    const dy = shift(r.top, r.bottom, pin.top, pin.bottom, lo.y, hi.y, true);
    if (!dx && !dy) return;
    // The popup's own box moves with the map, so check again once it stopped (the side it opens to can flip).
    if (pass < 2) map.once("moveend", () => fitOnce(pass + 1));
    map.panBy([-dx, -dy], { duration: reducedMotion() ? 0 : 250, essential: true });
  };
  popup.on("open", () => {
    popup.setMaxWidth(`${Math.max(140, Math.min(240, map.getContainer().clientWidth - POPUP_PAD.left - POPUP_PAD.right))}px`);
    requestAnimationFrame(() => fitOnce(0));
  });
}

/** A white chevron pointing along the line (east = forwards), drawn at 2x for sharp screens. */
function arrowImage(): ImageData {
  const size = 36;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  // A white disc with a dark edge, readable on every line colour, and a dark chevron in it.
  g.beginPath();
  g.arc(18, 18, 15, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  g.strokeStyle = "rgba(23, 33, 58, 0.45)";
  g.lineWidth = 2;
  g.stroke();
  g.beginPath();
  g.moveTo(14, 10.5);
  g.lineTo(22, 18);
  g.lineTo(14, 25.5);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "#17213a";
  g.lineWidth = 4.5;
  g.stroke();
  return g.getImageData(0, 0, size, size);
}

function pinElement(className: string, glyph: string, title: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `mt-pin ${className}`;
  el.textContent = glyph;
  el.title = title;
  // MapLibre names every pin "Map marker" for screen readers unless it already has a label.
  el.setAttribute("aria-label", title);
  return el;
}

function fit(map: MlMap, b: BBox, duration = 0) {
  map.fitBounds(
    [
      [b.sw.lon, b.sw.lat],
      [b.ne.lon, b.ne.lat],
    ],
    { padding: FIT_PADDING, maxZoom: 15, duration }
  );
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Never closer than this when centring on a pick. */
const CENTRE_MAX_ZOOM = 16;

/**
 * Centre on `item` at a zoom that shows `context` too (the trailhead, the join point): the box around
 * both, mirrored about the item so it stays in the middle. Not closer than 16, not wider than `floor`
 * (the step's default view).
 */
function centreOn(map: MlMap, item: LatLng, context: LatLng | undefined, floor: BBox | null, duration: number) {
  let zoom = CENTRE_MAX_ZOOM;
  if (context) {
    const lons = [context.lon, 2 * item.lon - context.lon];
    const lats = [context.lat, 2 * item.lat - context.lat];
    const cam = map.cameraForBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 40, maxZoom: CENTRE_MAX_ZOOM }
    );
    if (cam?.zoom !== undefined) zoom = Math.min(zoom, cam.zoom);
  }
  if (floor) {
    const base = map.cameraForBounds(
      [
        [floor.sw.lon, floor.sw.lat],
        [floor.ne.lon, floor.ne.lat],
      ],
      { padding: FIT_PADDING, maxZoom: 15 }
    );
    if (base?.zoom !== undefined) zoom = Math.max(zoom, base.zoom);
  }
  map.easeTo({ center: [item.lon, item.lat], zoom: Math.min(zoom, CENTRE_MAX_ZOOM), duration, essential: true });
}

/**
 * Where the last trip map stood. Opening another route is a new page, so its map is a new
 * one; it starts where the last left off and glides to its trail instead of jumping there.
 */
let lastCamera: { center: [number, number]; zoom: number; at: number } | null = null;
const GLIDE_WITHIN_MS = 15_000;

export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e4ebe3" } }],
};

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * MapLibre map on OpenFreeMap vector tiles. Trails are our own lines in their
 * KST colour with a white casing (like the painted marks); drive leg dashed.
 */
/** A tap this close to a pin's middle (px) goes to the pin, not the route line under it. */
const PIN_REACH_PX = 26;

export function TrailMap({
  tracks,
  markers,
  bounds,
  refit = 0,
  scope,
  focusFloor,
  openOn,
  onSelectTrail,
  onHoverTrail,
  driveLeg,
  walkLeg,
  sideLegs,
  network,
  ariaLabel,
  className,
  persistKey,
  onMap,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<{ ml: MapLibre; map: MlMap } | null>(null);
  const onSelectRef = useRef(onSelectTrail);
  const onHoverRef = useRef(onHoverTrail);
  const fittedRef = useRef(false);
  // The map came from the last page of this place: it is already placed, and a focus request made just before
  // (the route pick) was answered by that page's map.
  const adoptedRef = useRef(false);
  const persistRef = useRef(persistKey);
  const networkRef = useRef(network);
  const boundsRef = useRef<BBox | null>(bounds);
  // The view was centred on a pick: a resize keeps it instead of fitting the step's default view again.
  const centredRef = useRef(false);
  // The visitor pressed, touched or scrolled the map since the last fit: it is theirs now, no settling refit.
  const touchedRef = useRef(false);
  const floorRef = useRef(focusFloor);
  const openOnRef = useRef(openOn);
  // The pins and what the map's handlers call live on the map itself, so they go with it when it is kept.
  const liveRef = useRef<KeptLive>({ select: () => {}, hover: () => {}, hoverOn: () => false, markers: [], markerIds: [], userMarkers: [] });
  const { fix, start } = useUserLocation();

  useEffect(() => {
    onSelectRef.current = onSelectTrail;
    onHoverRef.current = onHoverTrail;
    floorRef.current = focusFloor;
    openOnRef.current = openOn;
    persistRef.current = persistKey;
  }, [onSelectTrail, onHoverTrail, focusFloor, openOn, persistKey]);

  // Create the map once (or take over the parked one of this place); park or tear it down on unmount.
  // A layout effect: the kept map is back in the page in the same frame the new page shows, with no empty one between.
  useLayoutEffect(() => {
    let cancelled = false;
    let entry: KeptMap | null = null;
    let observer: ResizeObserver | null = null;

    // Puts the map into this component's slot and hands it to the effects below once it is loaded.
    function bind(e: KeptMap) {
      entry = e;
      if (persistRef.current) mapShown(persistRef.current, true);
      liveRef.current = e.live;
      e.live.select = (slug) => onSelectRef.current?.(slug);
      e.live.hover = (slug) => onHoverRef.current?.(slug);
      e.live.hoverOn = () => !!onHoverRef.current;
      containerRef.current!.appendChild(e.el);
      const map = e.map;
      // The map sits in flex/sticky containers whose size can change: keep the
      // requested area in view rather than whatever zoom fit the old size.
      let firstResize = true;
      observer = new ResizeObserver(() => {
        // The first call is the initial size: the bounds effect places the view (maybe gliding).
        if (firstResize) {
          firstResize = false;
          return;
        }
        map.resize();
        if (boundsRef.current && !centredRef.current) fit(map, boundsRef.current);
      });
      observer.observe(e.el);
      for (const ev of ["pointerdown", "wheel", "touchstart"]) e.el.addEventListener(ev, () => (touchedRef.current = true), { passive: true });
      const ready = () => !cancelled && setCtx({ ml: e.ml, map });
      if (e.loaded) ready();
      else e.onLoad = ready;
    }

    async function init() {
      // The map of the route page just left: same canvas, same tiles, no rebuild.
      const kept = takeKeptMap(persistRef.current);
      if (kept) {
        fittedRef.current = true;
        adoptedRef.current = true;
        bind(kept);
        // It sat detached (zero-sized) for a moment: its canvas takes the slot's size again.
        kept.map.resize();
        return;
      }
      const ml = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      const from = lastCamera && Date.now() - lastCamera.at < GLIDE_WITHIN_MS ? lastCamera : null;
      if (from) fittedRef.current = true; // the first fit glides from there
      const el = document.createElement("div");
      el.className = "h-full w-full";
      // In the page before the map is made, so it measures the slot.
      containerRef.current.appendChild(el);
      const map = new ml.Map({
        container: el,
        style: MAP_STYLE_URL,
        ...(from ? { center: from.center, zoom: from.zoom } : { bounds: SLOVAKIA }),
        attributionControl: { compact: true },
        locale: mapLocale(pageLang()),
        cooperativeGestures: false,
        dragRotate: false,
        pitchWithRotate: false,
        // Flat only: a two-finger drag on phones tilted the map into 3D by accident (Peter, 2026-10-24).
        touchPitch: false,
        maxPitch: 0,
        pixelRatio: mapPixelRatio(),
      });
      let detachNetwork: (() => void) | null = null;
      let detachLimit: (() => void) | null = null;
      const live: KeptLive = { select: () => {}, hover: () => {}, hoverOn: () => false, markers: [], markerIds: [], userMarkers: [] };
      const e: KeptMap = {
        el,
        map,
        ml,
        live,
        loaded: false,
        onLoad: null,
        timer: null,
        dispose: () => {
          if (e.timer) clearTimeout(e.timer);
          detachNetwork?.();
          detachLimit?.();
          map.remove();
          el.remove();
        },
      };
      map.touchZoomRotate.disableRotation();
      // The compact attribution opens by itself at first (it covered pins and popups on the small step maps):
      // start it as the little "i" and open it only on a tap. The credit stays one tap away.
      // MapLibre re-opens it by itself whenever new map data brings its credits (the trail tiles arriving), so a
      // watcher folds it back each time, until the visitor taps the "i" themselves.
      const attrib = el.querySelector(".maplibregl-ctrl-attrib");
      let tapped = false;
      const closeAttribution = () => {
        if (tapped || !attrib) return;
        // Only touch what is actually set: classList.remove rewrites the class attribute even when the class
        // isn't there, which would wake the watcher below again and loop forever (it froze the page).
        if (attrib.classList.contains("maplibregl-compact-show")) attrib.classList.remove("maplibregl-compact-show");
        if (attrib.hasAttribute("open")) attrib.removeAttribute("open");
      };
      attrib?.querySelector(".maplibregl-ctrl-attrib-button")?.addEventListener("click", () => {
        tapped = true;
      });
      const attribWatch = attrib ? new MutationObserver(closeAttribution) : null;
      if (attrib) attribWatch!.observe(attrib, { attributes: true, attributeFilter: ["class", "open"] });
      map.once("remove", () => attribWatch?.disconnect());
      closeAttribution();
      map.on("moveend", () => {
        const c = map.getCenter();
        lastCamera = { center: [c.lng, c.lat], zoom: map.getZoom(), at: Date.now() };
      });
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");

      // Base map unreachable (offline, blocked): fall back to a plain background
      // so the trail, pins and drive leg still show.
      let styleFailed = false;
      map.on("error", (ev) => {
        if (styleFailed || map.isStyleLoaded() || !String(ev.error?.message).includes(MAP_STYLE_URL)) return;
        styleFailed = true;
        map.setStyle(FALLBACK_STYLE);
      });

      map.on("load", () => {
        hideBasePois(map);
        detachLimit = keepInSlovakia(map);
        // Under everything of ours: the whole trail network.
        if (networkRef.current) detachNetwork = attachTrailNetwork(map, networkRef.current, POPULARITY_RAMP, POPULARITY_TOP_OUTLINE);
        map.addSource("drive", { type: "geojson", data: EMPTY });
        map.addSource("tracks", { type: "geojson", data: EMPTY });
        map.addSource("walk", { type: "geojson", data: EMPTY });
        map.addSource("side", { type: "geojson", data: EMPTY });
        map.addLayer({
          id: "drive-casing",
          type: "line",
          source: "drive",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 7.5, "line-opacity": 0.9 },
        });
        // Getting there in one dark ink: the drive solid, the walks on foot dotted, the trail in its
        // marking colours (Peter, 2026-10-23: four looks were too much; 2026-10-24: a grey drive
        // blended into the map and the other routes).
        map.addLayer({
          id: "drive-line",
          type: "line",
          source: "drive",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#17213a", "line-width": 3.5 },
        });
        // White band under the colour, like the painted KST mark.
        map.addLayer({
          id: "track-casing",
          type: "line",
          source: "tracks",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            // Other routes ("normal") get no white band: they run as a thin line on top (below).
            "line-width": ["match", ["get", "state"], "selected", 10, "dimmed", 5, 0],
            "line-opacity": ["match", ["get", "state"], "dimmed", 0.4, 1],
          },
        });
        map.addLayer({
          id: "track-line",
          type: "line",
          source: "tracks",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["match", ["get", "state"], "selected", 5, "dimmed", 2.5, 2],
            "line-opacity": ["match", ["get", "state"], "dimmed", 0.35, 1],
          },
        });
        // Which way a loop goes: small white chevrons along the picked line.
        map.addImage("track-arrow", arrowImage(), { pixelRatio: 2 });
        map.addLayer({
          id: "track-arrows",
          type: "symbol",
          source: "tracks",
          filter: ["==", ["get", "arrows"], true],
          layout: {
            "symbol-placement": "line",
            "symbol-spacing": 140,
            "icon-image": "track-arrow",
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
        // Parking -> trail start on foot: small dots, on top of the trail's start.
        map.addLayer({
          id: "walk-casing",
          type: "line",
          source: "walk",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: "walk-line",
          type: "line",
          source: "walk",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#17213a", "line-width": 3, "line-dasharray": [0.1, 1.8] },
        });
        // Off the trail to an added stop and back: solid in the place's own colour on a white edge, over
        // everything else, so it is never lost under the trail (Peter, 2026-10-24).
        map.addLayer({
          id: "side-casing",
          type: "line",
          source: "side",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 9 },
        });
        map.addLayer({
          id: "side-line",
          type: "line",
          source: "side",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": ["get", "colour"], "line-width": 5 },
        });
        // Wide invisible line so thin tracks are easy to tap.
        map.addLayer({
          id: "track-hit",
          type: "line",
          source: "tracks",
          paint: { "line-color": "#000000", "line-width": 18, "line-opacity": 0 },
        });
        // The pin closest to a tap, if the tap landed within a finger's width of it.
        const nearestMarker = (at: { x: number; y: number }) => {
          let best: Marker | null = null;
          let bestD = PIN_REACH_PX;
          for (const m of live.markers) {
            const p = map.project(m.getLngLat());
            const d = Math.hypot(p.x - at.x, p.y - at.y);
            if (d < bestD) [best, bestD] = [m, d];
          }
          return best;
        };
        map.on("click", "track-hit", (ev) => {
          // A tap on a pin, or right beside one, is for the pin (its popup, "Pridať zastávku"), not the route under it.
          const target = ev.originalEvent.target as Element | null;
          if (target?.closest?.(".maplibregl-marker, .maplibregl-popup")) return;
          const near = nearestMarker(ev.point);
          if (near) {
            // Its own tap actions (pick the parking...) and its popup, as if the pin itself was hit.
            near.getElement().dispatchEvent(new MouseEvent("click"));
            if (!near.getPopup()?.isOpen()) near.togglePopup();
            return;
          }
          const slug = ev.features?.[0]?.properties?.slug as string | undefined;
          if (slug) live.select(slug);
        });
        map.on("mousemove", "track-hit", (ev) => {
          const slug = ev.features?.[0]?.properties?.slug as string | undefined;
          if (!live.hoverOn()) return;
          map.getCanvas().style.cursor = "pointer";
          live.hover(slug ?? null);
        });
        map.on("mouseleave", "track-hit", () => {
          if (!live.hoverOn()) return;
          map.getCanvas().style.cursor = "";
          live.hover(null);
        });
        e.loaded = true;
        e.onLoad?.();
        e.onLoad = null;
      });

      bind(e);
    }

    init();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (entry) {
        if (persistRef.current) mapShown(persistRef.current, false);
        entry.onLoad = null;
        const c = entry.map.getCenter();
        lastCamera = { center: [c.lng, c.lat], zoom: entry.map.getZoom(), at: Date.now() };
        const key = persistRef.current;
        if (key) {
          // The next route page of this place takes the map over; the page's slot goes without it.
          entry.el.remove();
          keepMap(key, entry);
        } else entry.dispose();
      }
      setCtx(null);
    };
  }, []);

  // Fit when the requested area changes.
  const boundsKey = bounds ? `${bounds.sw.lat},${bounds.sw.lon},${bounds.ne.lat},${bounds.ne.lon}` : "";
  useEffect(() => {
    boundsRef.current = bounds;
    if (!ctx || !bounds) return;
    // The first view appears at once; later changes (another route) glide there.
    // A step map opened after a parking was picked starts centred on it.
    const first = openOnRef.current;
    centredRef.current = !fittedRef.current && !!first;
    if (centredRef.current) centreOn(ctx.map, first!.location, first!.context, bounds, 0);
    else fit(ctx.map, bounds, fittedRef.current && !reducedMotion() ? 600 : 0);
    fittedRef.current = true;
    // The slot can still be settling (a wider layout, a gliding start): once it has, size the map to it and frame the
    // area again, unless the visitor already took the map in hand.
    touchedRef.current = false;
    const map = ctx.map;
    const settle = setTimeout(() => {
      if (touchedRef.current || centredRef.current || !boundsRef.current) return;
      map.resize();
      fit(map, boundsRef.current);
    }, 900);
    return () => clearTimeout(settle);
    // `bounds` is tracked via boundsKey so a new-but-equal object doesn't refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, boundsKey, refit]);

  // Tracks: dimmed first, then the picked line, other routes thin on top.
  useEffect(() => {
    if (!ctx) return;
    // Other routes go over the picked one as a thin line, so where they share a path both
    // show: a stripe down the middle of it (Peter's pick, 2026-10-27).
    const order: Record<TrackState, number> = { dimmed: 0, selected: 1, normal: 2 };
    const features: GeoJSON.Feature[] = [...tracks]
      .filter((t) => t.points.length >= 2)
      .sort((a, b) => order[a.state] - order[b.state])
      .map((t) => ({
        type: "Feature",
        properties: {
          slug: t.slug,
          color: t.color,
          state: t.state,
          label: t.label ?? "",
          arrows: !!t.arrows,
        },
        geometry: { type: "LineString", coordinates: t.points.map(lngLat) },
      }));
    (ctx.map.getSource("tracks") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  }, [ctx, tracks]);

  // Drive leg.
  useEffect(() => {
    if (!ctx) return;
    const data: GeoJSON.FeatureCollection =
      driveLeg && driveLeg.length >= 2
        ? {
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: driveLeg.map(lngLat) } },
            ],
          }
        : EMPTY;
    (ctx.map.getSource("drive") as GeoJSONSource | undefined)?.setData(data);
  }, [ctx, driveLeg]);

  // Walk leg.
  useEffect(() => {
    if (!ctx) return;
    const data: GeoJSON.FeatureCollection =
      walkLeg && walkLeg.length >= 2
        ? {
            type: "FeatureCollection",
            features: [
              { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: walkLeg.map(lngLat) } },
            ],
          }
        : EMPTY;
    (ctx.map.getSource("walk") as GeoJSONSource | undefined)?.setData(data);
  }, [ctx, walkLeg]);

  // Side trips to the added stops.
  useEffect(() => {
    if (!ctx) return;
    const legs = (sideLegs ?? []).filter((l) => l.points.length >= 2);
    const data: GeoJSON.FeatureCollection = legs.length
      ? {
          type: "FeatureCollection",
          features: legs.map((l) => ({
            type: "Feature",
            properties: { colour: l.colour },
            geometry: { type: "LineString", coordinates: l.points.map(lngLat) },
          })),
        }
      : EMPTY;
    (ctx.map.getSource("side") as GeoJSONSource | undefined)?.setData(data);
  }, [ctx, sideLegs]);

  // Markers: HTML elements so they can use the brand's square trail marks.
  useEffect(() => {
    if (!ctx) return;
    const { ml, map } = ctx;
    for (const m of liveRef.current.markers) m.remove();
    // Active last so it sits on top.
    const sorted = [...markers].sort((a, b) => Number(!!a.active) - Number(!!b.active));
    liveRef.current.markerIds = sorted.map((m) => m.id);
    liveRef.current.markers = sorted
      .map((m) => {
        const el = pinElement(
          `${MARKER_CLASS[m.kind]}${m.dimmed ? " mt-pin-dimmed" : ""}${m.active ? " is-active" : ""}`,
          MARKER_GLYPH[m.kind],
          m.title
        );
        if (m.colour) el.style.background = m.colour;
        // Constant markup from lib/kindIcons.ts and lib/uiIcons.ts, no user data.
        const icon = m.icon ?? MARKER_ICON[m.kind];
        if (icon) el.innerHTML = icon;
        if (m.label) {
          const label = document.createElement("span");
          label.className = `mt-pin-label font-data ${m.labelSide === "left" ? "is-left" : ""}`;
          label.textContent = m.label;
          el.appendChild(label);
        }
        const popup = new ml.Popup({ offset: 14, closeButton: false }).setDOMContent(popupContent(m.title, m.lines, m.action));
        keepPopupInView(map, popup);
        const marker = new ml.Marker({ element: el }).setLngLat([m.location.lon, m.location.lat]).setPopup(popup).addTo(map);
        const slug = m.trailSlug;
        const onPick = m.onClick;
        if (slug) el.addEventListener("click", () => onSelectRef.current?.(slug));
        if (onPick) el.addEventListener("click", onPick);
        // MapLibre's own Enter/Space only opens the popup: also pick the trail or parking, as a tap does.
        if (slug || onPick)
          el.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            if (slug) onSelectRef.current?.(slug);
            onPick?.();
          });
        return marker;
      });
  }, [ctx, markers]);


  // A row in a list below, or a pick in a plan step, asks for its place: bring the map into view, centre on it
  // with the trail in view, open the pin. Only the map of that step answers (the big map answers all).
  useEffect(() => {
    if (!ctx) return;
    const { map } = ctx;
    // `replay`: the request came just before this map mounted; jump there without scrolling or gliding.
    const apply = ({ id, location, scope: asked, context, fit: points }: MapFocus, replay = false) => {
      if (scope && (asked ? asked !== scope : scope !== "places")) return;
      // A route pick fits the line where the map is: the page must not move.
      if (!replay && !points?.length) containerRef.current?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
      const duration = replay || reducedMotion() ? 0 : 600;
      centredRef.current = !points?.length;
      if (points?.length) {
        const lons = points.map((p) => p.lon);
        const lats = points.map((p) => p.lat);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 40, maxZoom: CENTRE_MAX_ZOOM, duration }
        );
        return;
      }
      for (const m of liveRef.current.markers) if (m.getPopup()?.isOpen()) m.togglePopup();
      const i = id ? liveRef.current.markerIds.indexOf(id) : -1;
      if (i >= 0) map.once("moveend", () => liveRef.current.markers[i]?.togglePopup());
      if (context || asked) centreOn(map, location, context, floorRef.current?.(asked ?? scope) ?? null, duration);
      else map.flyTo({ center: [location.lon, location.lat], zoom: Math.max(map.getZoom(), 15), essential: true, duration });
    };
    const recent = recentFocus(4000);
    // A kept map was there when it was asked: it has already answered.
    if (recent && !adoptedRef.current) apply(recent, true);
    return onMapFocus((target) => apply(target));
  }, [ctx, scope]);

  // The owner's own layer (the day map's walker).
  useEffect(() => {
    if (!ctx || !onMap) return;
    return onMap(ctx.ml, ctx.map) ?? undefined;
  }, [ctx, onMap]);

  // Start pin (typed place) and "you are here" dot (GPS).
  useEffect(() => {
    if (!ctx) return;
    const { ml, map } = ctx;
    for (const m of liveRef.current.userMarkers) m.remove();
    liveRef.current.userMarkers = [];
    if (start?.source === "manual") {
      liveRef.current.userMarkers.push(
        new ml.Marker({ element: pinElement("mt-pin-start", "S", start.label) })
          .setLngLat([start.lon, start.lat])
          .setPopup(new ml.Popup({ offset: 14, closeButton: false }).setDOMContent(popupContent(tr(pageLang(), "Štart"), [tr(pageLang(), start.label)])))
          .addTo(map)
      );
    }
    if (fix) {
      liveRef.current.userMarkers.push(
        new ml.Marker({ element: pinElement("mt-pin-me", "", tr(pageLang(), "Vaša poloha")) }).setLngLat([fix.lon, fix.lat]).addTo(map)
      );
    }
  }, [ctx, fix, start]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} role="region" aria-label={ariaLabel} />;
}
