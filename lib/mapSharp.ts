// Keeps a map sharp on any screen (Peter, 24 Nov 2026, C214/C216: on his 27-inch PC monitor "everything on
// the map" was blurry, most of all the day map above the sun dial; fine on the laptop). Two causes, both
// the same mistake: something drawn between the screen's pixels, which the browser then smears over two.
//
// 1. The pins. They are HTML elements laid over the canvas, each on its own layer, at whole points from the
//    map's corner. The corner itself can sit at a part of a point (the day map: the text above it is
//    18.75 px a line). A laptop or phone has two or three pixels a point and hides that; a desk monitor at
//    100 % has one, and every pin and time label came out soft beside crisp road numbers. The canvas and
//    the pins share one parent, so that parent is moved onto the pixel grid and both follow.
//
// 2. The canvas, at a Windows scale of 125, 150 or 175 % (or with the page zoomed). MapLibre draws into a
//    canvas of whole pixels; the browser shows it 1:1 only when the map's size in points is a whole number
//    of pixels too. A 2099-point map at 150 % is 3148.5 pixels: the canvas has 3148 and gets stretched by
//    that half pixel. Measured on the live trip page: 26 to 37 % of the fine detail gone at 125/150/175 %,
//    none at 100 % and 200 %. So the map is drawn up to 3 points smaller than its slot, at the nearest size
//    that is whole pixels; the rest of the slot shows the map's own background colour.
import type { Map as MlMap } from "maplibre-gl";
import { mapPixelRatio } from "@/lib/mapLayers";

/** The land colour of the base map (OpenFreeMap "liberty"), for the sliver of a slot the map doesn't cover. */
const MAP_LAND = "#f8f4f0";

/** How far (in CSS px) to move something at `at` so it starts on a whole screen pixel: half a pixel at most, either way. */
export function pixelNudge(at: number, dpr: number): number {
  return (Math.round(at * dpr) - at * dpr) / dpr;
}

/**
 * The size to draw a map in a slot of `points` CSS px: the largest one, at most 3 smaller, that is a whole
 * number of screen pixels. The slot's own size when it already is, or when no such size is near (an odd page zoom).
 */
export function sharpSize(points: number, dpr: number): number {
  for (let n = points; n >= points - 3 && n > 0; n--) if (Math.abs(n * dpr - Math.round(n * dpr)) < 0.01) return n;
  return points;
}

const px = (n: number) => `${Math.round(n * 10000) / 10000}px`;

/**
 * Call once on a new map. From then on it sits on the screen's pixel grid and draws at the screen's current
 * scale: the scale was read once when the map was made, so zooming the page or moving the window to another
 * monitor left a map made for the old scale, stretched.
 */
export function keepMapSharp(map: MlMap): void {
  // The parent of the canvas and of every pin: a box at the map's corner.
  const layer = map.getCanvasContainer();
  const slot = map.getContainer();
  layer.style.position = "relative";
  if (!slot.style.backgroundColor) slot.style.backgroundColor = MAP_LAND;
  // True while the screen has as many pixels a point as the map draws (phones with 3 draw at 2 on purpose, lib/mapLayers.ts).
  const oneToOne = () => Math.abs((window.devicePixelRatio || 1) - mapPixelRatio()) < 0.001;

  // MapLibre asks this for the slot's size on every resize (not public, so checked: without it only the pins are fixed).
  const measure = map._containerDimensions;
  if (typeof measure === "function")
    map._containerDimensions = () => {
      const [w, h] = measure.call(map);
      const dpr = window.devicePixelRatio || 1;
      return oneToOne() ? [sharpSize(w, dpr), sharpSize(h, dpr)] : [w, h];
    };

  let scaleWatch: MediaQueryList | null = null;
  let drawnFor = 0;

  const align = () => {
    const dpr = window.devicePixelRatio || 1;
    if (Math.abs(map.getPixelRatio() - mapPixelRatio()) > 0.001 || dpr !== drawnFor) {
      drawnFor = dpr;
      map.setPixelRatio(mapPixelRatio()); // resizes the map (to a size sharp at this scale), which comes back here
      return;
    }
    const at = slot.getBoundingClientRect();
    if (!at.width || !at.height) return; // parked off the page (lib/keptMap.ts)
    const next = { left: px(pixelNudge(at.left + slot.clientLeft, dpr)), top: px(pixelNudge(at.top + slot.clientTop, dpr)) };
    if (layer.style.left !== next.left) layer.style.left = next.left;
    if (layer.style.top !== next.top) layer.style.top = next.top;
  };

  // The screen's scale changed (page zoom, another monitor): a media query for one exact scale, set up again each time.
  const watchScale = () => {
    scaleWatch?.removeEventListener("change", onScale);
    scaleWatch = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    scaleWatch.addEventListener("change", onScale);
  };
  const onScale = () => {
    watchScale();
    align();
  };

  // The page around the map changed height (a plan step opened above it): the map may have moved by a part of a pixel.
  const page = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
  page?.observe(document.documentElement);

  map.on("resize", align);
  map.on("idle", align);
  window.addEventListener("resize", align);
  watchScale();
  map.once("remove", () => {
    page?.disconnect();
    window.removeEventListener("resize", align);
    scaleWatch?.removeEventListener("change", onScale);
  });
  align();
}
