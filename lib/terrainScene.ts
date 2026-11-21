// Pictures drawn from a place's real terrain (C201, Peter 20 Nov 2026), for the places without a photo:
// the card strip ("A": the place at 0.75 across the 96 px strip, clear of the white kind icon) and the wide banner
// on top of the trip page. The skyline comes from pipeline/terrain.py (AWS Terrain Tiles): three depth layers,
// elevation angle per view column, packed as ints in 0.05 degree. Pure functions, SVG markup out; the drawing is
// ported from the approved mockups (Túruj/brand-ux/mockups/2026-11-20-terrain-outlines/gen.mts, gen_low.mts).
//
// Hard rules from Peter, each covered in terrainScene.test.ts:
//  1. A building or feature stands on the ground along its whole base, never floats: castle/hut/tower get ground
//     raised under the footprint with gentle slopes, water lands in a pool, a lake has ground all round, a cave
//     floor is the ground line, trees stand on a ground line.
//  2. Card: the summit / sign / feature sits at x = 0.75 of the 96 wide strip.
//  3. No flag. The banner's waterfall is 1.4 x the card's scale.
//  4. The same place always gives the same picture (seeded by the place id, never by slug or time).
import { GOAL_COLOUR } from "@/lib/palette";
import type { DestinationKind } from "@/lib/tripSchema";

/** Order of the kind index stored in terrain-cards.json (same list in pipeline/terrain.py). */
export const TERRAIN_KINDS: DestinationKind[] = ["vrchol", "hrad", "vyhliadka", "chata", "vodopad", "pleso", "roklina", "jaskyna", "ine"];

/** The two windows cut from the 80 degree, 241 column view (same numbers as pipeline/terrain.py WINDOWS). */
const STEP = 0.05;
export const WINDOW = {
  card: { n: 103, focusCol: 77, fov: 34 },
  banner: { n: 193, focusCol: 96, fov: 64 },
} as const;
export type WindowName = keyof typeof WINDOW;

/** Three packed layers, nearest first: each [a0, dx1, da1, dx2, da2, ...] (pipeline/terrain.py pack_layer). */
export type PackedLayers = number[][];

/** The geometry a picture was drawn from, for the tests of the ground rule. */
export interface SceneGeometry {
  svg: string;
  /** Width and height of the picture's own units. */
  W: number;
  H: number;
  /** x of the summit / feature (the window's focus). */
  focusX: number;
  /** The line the feature stands on, with the raised ground under it where there is one. */
  ground: number[][];
  /** Things that stand on the ground: their span in x and the y of their base. */
  anchors: { what: string; x0: number; x1: number; y: number }[];
  /** Tree bases and the ground line each was placed on. */
  trees: { x: number; y: number; w: number; line: number[][] }[];
  /** Vertical exaggeration of the view. */
  exag: number;
}

/** Packed layer to degrees per column. */
export function unpackLayer(packed: number[], n: number): number[] {
  const cols = [0];
  const angs = [packed[0]];
  for (let i = 1; i + 1 < packed.length; i += 2) {
    cols.push(cols[cols.length - 1] + packed[i]);
    angs.push(angs[angs.length - 1] + packed[i + 1]);
  }
  const out = new Array<number>(n);
  let k = 0;
  for (let i = 0; i < n; i++) {
    while (k < cols.length - 2 && cols[k + 1] < i) k++;
    const span = cols[k + 1] - cols[k];
    const f = span > 0 ? Math.min(Math.max((i - cols[k]) / span, 0), 1) : 0;
    out[i] = (angs[k] + f * ((angs[k + 1] ?? angs[k]) - angs[k])) * STEP;
  }
  return out;
}

/** Douglas-Peucker on [x, y] points. */
function simplify(pts: number[][], tol: number): number[][] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0;
  let dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = Math.abs((b[1] - a[1]) * p[0] - (b[0] - a[0]) * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.hypot(b[1] - a[1], b[0] - a[0]);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= tol) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

/** Deterministic randomness per place, so a picture never changes between builds. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

const mix = (c: string, w: number) => `color-mix(in srgb, #fff ${w}%, ${c})`;
const fillOf = (c: string, w: number) => `style="fill:${mix(c, w)}"`;
const TONES = [30, 15, 7]; // peaks: near, summit band, far
const f1 = (v: number) => v.toFixed(1);
const pathOf = (H: number, W: number, pts: number[][]) => `M0 ${H} ${pts.map((p) => `L${f1(p[0])} ${f1(p[1])}`).join(" ")} L${W} ${H}Z`;

/** Small kind signs, re-based so (0,0) is the middle of their base. */
const SIGNS: Partial<Record<DestinationKind, string>> = {
  hrad: "M-12.5 0 V-9 h3 v2.5 h3 V-9 h3 v2.5 h2 V-16 l3 -3.5 l3 3.5 V-6.5 h2 V-9 h3 v2.5 h3 V-9 h1 V0Z",
  vyhliadka: "M-3.5 0 L-2 -13 L-3.5 -13 L-3.5 -15.5 L0 -19 L3.5 -15.5 L3.5 -13 L2 -13 L3.5 0Z",
  chata: "M-6.5 1 V-5 L0 -10.5 L6.5 -5 V1Z",
};
const SIGN_HALF: Partial<Record<DestinationKind, number>> = { hrad: 12.5, vyhliadka: 3.5, chata: 6.5 };

const open = (W: number, H: number) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" style="position:absolute;inset:0;width:100%;height:100%">`;

/**
 * x of column j: the window's focus column lands exactly on `fx` (0.75 of the strip on a card; a window cut at whole
 * columns has it 0.47 px off), the ends stay on the picture's edges.
 */
function columnX(n: number, focusCol: number, W: number, fx: number) {
  const dx = W / (n - 1);
  return (j: number) => (j === 0 ? 0 : j === n - 1 ? W : fx + (j - focusCol) * dx);
}

/** The columns of a window as degrees, three layers. */
function columns(layers: PackedLayers, which: WindowName): number[][] {
  return layers.map((l) => unpackLayer(l, WINDOW[which].n));
}

/**
 * Peaks, castles, lookouts, huts: the real skyline in three layers, the summit at `focus` across and at yTop.
 * Ground rule: the summit layer is raised to the base across a building's footprint (+ a little), then falls away in
 * gentle slopes, like a castle hill; the sign's base is sunk 0.6 into it, so the two always overlap.
 */
function peakScene(kind: DestinationKind, L: number[][], which: WindowName, W: number, H: number, yTop: number, tol: number, signScale: number, focus: number): SceneGeometry {
  const colour = GOAL_COLOUR[kind];
  const n = WINDOW[which].n;
  const c = WINDOW[which].focusCol;
  const fx = focus * W;
  const xOf = columnX(n, c, W, fx);
  const summit = Math.max(...L[1].slice(c - 2, c + 3));
  const nearVals = L[0].filter((v) => v > -29);
  const base = nearVals.length ? Math.min(...nearVals) : summit - 1;
  const hScale = W / WINDOW[which].fov; // units per degree across
  let k = (H - yTop) / Math.max(summit - base, 1e-6);
  k = Math.min(Math.max(k, hScale * 1.6), hScale * 4);
  const y = (a: number) => yTop + (summit - a) * k;
  const sign = SIGNS[kind];
  const baseHalf = sign ? (SIGN_HALF[kind] ?? 0) * signScale : 0;
  let svg = open(W, H);
  let ground: number[][] = [];
  for (const layer of [2, 1, 0]) {
    const pts = L[layer].map((a, j) => [xOf(j), Math.min(y(a), H + 2)]);
    if (layer === 1 && baseHalf > 0) {
      const flat = baseHalf + 0.6;
      for (const p of pts) {
        const dx = Math.abs(p[0] - fx);
        p[1] = Math.min(p[1], dx <= flat ? yTop : yTop + 0.55 * (dx - flat));
      }
    }
    const s = simplify(pts, tol);
    if (layer === 1) ground = s;
    svg += `<path d="${pathOf(H, W, s)}" ${fillOf(colour, TONES[layer])}/>`;
    if (layer === 1 && sign) svg += `<path transform="translate(${f1(fx)} ${f1(yTop + 0.6)}) scale(${signScale})" d="${sign}" ${fillOf(colour, TONES[1])}/>`;
  }
  const anchors = sign ? [{ what: kind, x0: fx - baseHalf, x1: fx + baseHalf, y: yTop + 0.6 }] : [{ what: "summit", x0: fx, x1: fx, y: yTop }];
  return { svg: svg + "</svg>", W, H, focusX: fx, ground, anchors, trees: [], exag: k / hScale };
}

/** A spruce standing with its base on (x, y). */
const spruce = (x: number, y: number, h: number) => {
  const w = h * 0.42;
  const p = (a: number, b: number) => `${f1(a)} ${f1(b)}`;
  return `M${p(x - w, y)} L${p(x - w * 0.55, y - h * 0.42)} L${p(x - w * 0.8, y - h * 0.42)} L${p(x, y - h)} L${p(x + w * 0.8, y - h * 0.42)} L${p(x + w * 0.55, y - h * 0.42)} L${p(x + w, y)}Z`;
};

/** Height of a polyline at x. */
function yAt(pts: number[][], x: number) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((x - x0) / Math.max(x1 - x0, 1e-6)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

/** The lowest the line goes (largest y) between x0 and x1: a base set there is never above the ground. */
function lowestY(pts: number[][], x0: number, x1: number) {
  let m = Math.max(yAt(pts, x0), yAt(pts, x1));
  for (const p of pts) if (p[0] > x0 && p[0] < x1) m = Math.max(m, p[1]);
  return m;
}

/**
 * Trees along a ground line: each tree's whole base, not only its middle, is on or under the line (ground rule),
 * skipping `keep` (the feature).
 */
function treeline(pts: number[][], s: number, rand: () => number, density: number, size: number, keep: [number, number], out: SceneGeometry["trees"]) {
  let d = "";
  for (let x = 2 * s + rand() * 6 * s; x < pts[pts.length - 1][0] - 2 * s; x += ((3.2 + rand() * 4) * s) / density) {
    if (x > keep[0] && x < keep[1]) continue;
    const yl = yAt(pts, x - 1.5 * s);
    const yr = yAt(pts, x + 1.5 * s);
    if (Math.abs(yl - yr) > 5 * s) continue; // too steep for trees
    if (rand() < 0.22) {
      x += 6 * s; // clearings
      continue;
    }
    const h = (5 + rand() * 4.5) * s * size;
    const w = h * 0.42;
    const by = lowestY(pts, x - w, x + w) + 0.6 * s;
    out.push({ x, y: by, w, line: pts });
    d += spruce(x, by, h) + " ";
  }
  return d;
}

const LOW_TONES = { far: 5, mid: 11, near: 19, front: 30 };

/**
 * Waterfall, lake, gorge, cave, other: the backdrop is the real skyline seen standing at the place (nearest ridge,
 * middle, far), fitted between yTop and the horizon yH. Forest stands on the nearest ridge and on the foreground.
 * Ground rule: trees, water, lake, cave all have their base on a ground line; where the feature needs rock behind it
 * (cliff, cave) the nearest ridge is raised there, with gentle slopes.
 */
function lowScene(id: string, kind: DestinationKind, L: number[][], which: WindowName, W: number, H: number, yTop: number, tol: number, s: number, focus: number, yH: number): SceneGeometry {
  const colour = GOAL_COLOUR[kind];
  const rand = rng(id);
  const n = WINDOW[which].n;
  const sky = L[0].map((_, i) => Math.max(L[0][i], L[1][i], L[2][i]));
  const top = Math.max(...sky);
  const low = Math.min(...sky);
  const hScale = W / WINDOW[which].fov;
  let k = (yH - 10 * s - yTop) / Math.max(top - low, 0.5);
  k = Math.min(k, hScale * 4);
  const y = (a: number) => yH - 10 * s - (a - low) * k;
  const cx = focus * W;
  const xOf = columnX(n, WINDOW[which].focusCol, W, cx);
  const big = kind === "vodopad" && W > 200 ? 1.4 : 1; // the banner shows the falls bigger (Peter 20 Nov)
  const need: Partial<Record<DestinationKind, [number, number]>> = { vodopad: [9 * s * big, 46 * s * big], jaskyna: [16 * s, 34 * s] };
  const fill = (t: number) => fillOf(colour, t);
  const keep: [number, number] = kind === "pleso" ? [cx - 100 * s, cx + 100 * s] : kind === "vodopad" ? [cx - 8 * s * big, cx + 8 * s * big] : [cx - 16 * s, cx + 16 * s];
  const trees: SceneGeometry["trees"] = [];
  let svg = open(W, H);
  let nearPts: number[][] = [];
  const silhouette = sky.map((a, j) => [xOf(j), Math.min(y(a), yH + 2)]);
  for (const [layer, t] of [[2, LOW_TONES.far], [1, LOW_TONES.mid], [0, LOW_TONES.near]] as const) {
    const pts = L[layer].map((a, j) => [xOf(j), Math.min(y(a), yH + 2)]);
    if (layer === 0) {
      const spec = need[kind];
      if (spec) {
        const [hw, ht] = spec;
        // A smooth swell of the hill (cosine), so the cliff or cave sits IN the slope, not on a bump.
        const spread = hw + 46 * s;
        for (const q of pts) {
          const u = Math.min(Math.abs(q[0] - cx) / spread, 1);
          q[1] = Math.min(q[1], yH - ht * (0.5 + 0.5 * Math.cos(Math.PI * u)));
        }
      }
      nearPts = pts;
    }
    const sp = simplify(pts, tol);
    svg += `<path d="${pathOf(H, W, sp)}" ${fill(t)}/>`;
    if (layer === 1) svg += `<path d="${treeline(sp, s * 0.7, rand, 1.2, 0.8, [-1, -1], [])}" ${fill(t)}/>`;
    if (layer === 0) svg += `<path d="${treeline(sp, s, rand, 1, 1, keep, trees)}" ${fill(t)}/>`;
  }
  // Foreground ground in the front tone, with a few bigger trees on it near the edges.
  const fgPts: number[][] = [];
  for (let x = 0; x <= W; x += 4) {
    const u = (x - cx) / W;
    fgPts.push([x, yH + 2 * s * Math.sin(u * 7 + 1) - 3 * s * Math.abs(u) * 2]);
  }
  svg += `<path d="${pathOf(H, W, fgPts)}" ${fill(LOW_TONES.front)}/>`;
  const feature = featureSvg(id, kind, cx, yH, s * big, colour, H, nearPts);
  svg += feature.svg;
  const edge = (x0: number, x1: number) => {
    let d = "";
    for (let x = x0; x < x1; x += (6 + rand() * 7) * s) {
      if (rand() > 0.35) {
        const h = (11 + rand() * 7) * s;
        const by = lowestY(fgPts, x - h * 0.42, x + h * 0.42) + 1.5 * s;
        trees.push({ x, y: by, w: h * 0.42, line: fgPts });
        d += spruce(x, by, h) + " ";
      }
    }
    return d;
  };
  svg += `<path d="${edge(2 * s, Math.min(W * 0.22, keep[0] - 6 * s))}${edge(Math.max(W * 0.8, keep[1] + 6 * s), W - 2 * s)}" ${fill(LOW_TONES.front)}/>`;
  return { svg: svg + "</svg>", W, H, focusX: cx, ground: silhouette, anchors: feature.anchors, trees, exag: k / hScale };
}

function featureSvg(id: string, kind: DestinationKind, cx: number, yH: number, s: number, colour: string, H: number, nearPts: number[][]) {
  const uid = id.replace(/[^a-z0-9]/gi, "-");
  const water = mix(colour, 62);
  const foam = mix(colour, 85);
  const rock = mix(colour, 9);
  const stone = mix(colour, 40);
  const stream = (x0: number, w0: number) =>
    `M${f1(cx - w0)} ${f1(yH + 1 * s)} C${f1(cx - w0 - 2 * s)} ${f1(yH + 9 * s)} ${f1(x0 + 6 * s)} ${f1(yH + 15 * s)} ${f1(x0)} ${H}` +
    ` H${f1(x0 + 24 * s)} C${f1(x0 + 28 * s)} ${f1(yH + 15 * s)} ${f1(cx + w0 + 3 * s)} ${f1(yH + 9 * s)} ${f1(cx + w0)} ${f1(yH + 1 * s)}Z`;
  const none = { svg: "", anchors: [] as SceneGeometry["anchors"] };
  if (kind === "vodopad") {
    // The water comes out of a soft cleft in the slope (barely darker than the hill, edges fading into it), white
    // where it leaves the rock, a little spray where it lands, a pool and a stream on the ground.
    const t = yH - 34 * s;
    const gid = `fall-${uid}-${s.toFixed(2)}`;
    const p = (a: number, b: number) => `${f1(a)} ${f1(b)}`;
    const cleft = `M${p(cx - 11 * s, yH)} C${p(cx - 8 * s, yH - 14 * s)} ${p(cx - 6 * s, t + 2 * s)} ${p(cx - 3 * s, t - 5 * s)} H${f1(cx + 3 * s)} C${p(cx + 6 * s, t + 2 * s)} ${p(cx + 8 * s, yH - 14 * s)} ${p(cx + 11 * s, yH)}Z`;
    return {
      svg:
        `<defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${mix(colour, 19)}"/><stop offset=".3" stop-color="${mix(colour, 15)}"/><stop offset=".7" stop-color="${mix(colour, 15)}"/><stop offset="1" stop-color="${mix(colour, 19)}"/></linearGradient></defs>` +
        `<path d="${cleft}" fill="url(#${gid})"/>` +
        `<path d="M${p(cx - 1.6 * s, t - 3 * s)} C${p(cx - 3 * s, t + 10 * s)} ${p(cx - 4.6 * s, yH - 8 * s)} ${p(cx - 5.4 * s, yH)} H${f1(cx + 5.4 * s)} C${p(cx + 4.6 * s, yH - 8 * s)} ${p(cx + 3 * s, t + 12 * s)} ${p(cx + 2.6 * s, t)}Z" style="fill:${water}"/>` +
        `<path d="M${p(cx - 1 * s, t + 3 * s)} V${f1(yH - 4 * s)} M${p(cx + 1.6 * s, t + 9 * s)} V${f1(yH - 7 * s)}" style="stroke:${foam}" stroke-width="${f1(0.8 * s)}" stroke-linecap="round" fill="none"/>` +
        `<path d="${stream(cx - 10 * s, 4.5 * s)}" style="fill:${water}"/>` +
        `<ellipse cx="${f1(cx)}" cy="${f1(yH + 1.5 * s)}" rx="${f1(15 * s)}" ry="${f1(3.4 * s)}" style="fill:${water}"/>` +
        `<path d="M${p(cx - 8 * s, yH + 0.4 * s)} q${p(2 * s, -3.2 * s)} ${p(4 * s, -1 * s)} q${p(2 * s, -3.6 * s)} ${p(4.5 * s, -0.6 * s)} q${p(2.5 * s, -3.4 * s)} ${p(4.5 * s, 0.4 * s)} q${p(2 * s, -2.6 * s)} ${p(3.5 * s, 1.2 * s)}Z" style="fill:${foam}"/>` +
        `<path d="M${p(cx - 20 * s, yH + 3 * s)} q${p(3 * s, -5 * s)} ${p(6 * s, 0)}Z M${p(cx + 14 * s, yH + 3.5 * s)} q${p(4 * s, -6 * s)} ${p(8 * s, 0)}Z" style="fill:${stone}"/>`,
      // The cleft and the falling water start on the slope and end on the ground line, the pool lies in the ground.
      anchors: [{ what: "vodopad", x0: cx - 11 * s, x1: cx + 11 * s, y: yH }],
    };
  }
  if (kind === "pleso") {
    // The lake lies in the ground and mirrors the nearest ridge and its trees (flipped, squashed), plus shore stones.
    const rx = 96 * s;
    const ry = 12 * s;
    const cy = yH + 13 * s;
    const gid = `lake-${uid}-${s.toFixed(2)}`;
    const mirror = nearPts.filter((q) => Math.abs(q[0] - cx) < rx + 2).map((q) => [q[0], cy - ry + Math.min((yH + 2 - q[1]) * 0.16, ry * 1.1)]);
    const refl = mirror.length ? `M${f1(mirror[0][0])} ${f1(cy - ry)} ${mirror.map((q) => `L${f1(q[0])} ${f1(q[1])}`).join(" ")} L${f1(mirror[mirror.length - 1][0])} ${f1(cy - ry)}Z` : "";
    const p = (a: number, b: number) => `${f1(a)} ${f1(b)}`;
    return {
      svg:
        `<clipPath id="${gid}"><ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}"/></clipPath>` +
        `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx + 2 * s)}" ry="${f1(ry + 1.2 * s)}" style="fill:${mix(colour, 40)}"/>` +
        `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(ry)}" style="fill:${colour}"/>` +
        `<g clip-path="url(#${gid})"><path d="${refl}" style="fill:${mix(colour, 13)}"/>` +
        `<path d="M${p(cx - 34 * s, cy + 3 * s)} h${f1(30 * s)} M${p(cx + 8 * s, cy + 5 * s)} h${f1(22 * s)}" style="stroke:${mix(colour, 45)}" stroke-width="${f1(1 * s)}" stroke-linecap="round" fill="none"/></g>` +
        `<path d="M${p(cx - rx - 4 * s, cy + 2 * s)} q${p(3 * s, -5 * s)} ${p(7 * s, 0)}Z M${p(cx + rx - 6 * s, cy + 5 * s)} q${p(4 * s, -6 * s)} ${p(9 * s, 0)}Z" style="fill:${stone}"/>`,
      // Ground all round: the lake's top edge lies below the nearest ridge, which runs the whole width.
      anchors: [{ what: "pleso", x0: cx - rx, x1: cx + rx, y: cy - ry }],
    };
  }
  if (kind === "jaskyna") {
    const w = 8.5 * s;
    const h = 16 * s;
    const p = (a: number, b: number) => `${f1(a)} ${f1(b)}`;
    // A rock band around the mouth, the mouth with its floor on the ground, a path climbing to it.
    return {
      svg:
        `<path d="M${p(cx - 24 * s, yH)} C${p(cx - 22 * s, yH - 18 * s)} ${p(cx - 12 * s, yH - 27 * s)} ${p(cx, yH - 27 * s)} C${p(cx + 12 * s, yH - 27 * s)} ${p(cx + 22 * s, yH - 18 * s)} ${p(cx + 24 * s, yH)}Z" style="fill:${rock}"/>` +
        `<path d="M${p(cx - 18 * s, yH - 9 * s)} h${f1(6 * s)} M${p(cx + 12 * s, yH - 15 * s)} h${f1(7 * s)} M${p(cx - 14 * s, yH - 19 * s)} h${f1(5 * s)}" style="stroke:${mix(colour, 16)}" stroke-width="${f1(1.2 * s)}" stroke-linecap="round" fill="none"/>` +
        `<path d="M${p(cx - w, yH)} V${f1(yH - h + w)} A${f1(w)} ${f1(w)} 0 0 1 ${p(cx + w, yH - h + w)} V${f1(yH)}Z" style="fill:${colour}"/>` +
        `<path d="M${p(cx - 3 * s, yH)} C${p(cx - 6 * s, yH + 8 * s)} ${p(cx + 14 * s, yH + 12 * s)} ${p(cx + 6 * s, H)} H${f1(cx + 13 * s)} C${p(cx + 20 * s, yH + 12 * s)} ${p(cx + 1 * s, yH + 8 * s)} ${p(cx + 3 * s, yH)}Z" style="fill:${mix(colour, 46)}"/>`,
      anchors: [{ what: "jaskyna", x0: cx - 24 * s, x1: cx + 24 * s, y: yH }],
    };
  }
  if (kind === "roklina") {
    const p = (a: number, b: number) => `${f1(a)} ${f1(b)}`;
    return {
      svg:
        `<path d="${stream(cx - 14 * s, 1.6 * s)}" style="fill:${mix(colour, 50)}"/>` +
        `<path d="M${p(cx - 30 * s, yH + 6 * s)} q${p(4 * s, -6 * s)} ${p(8 * s, 0)}Z M${p(cx + 22 * s, yH + 9 * s)} q${p(4 * s, -6 * s)} ${p(9 * s, 0)}Z" style="fill:${stone}"/>`,
      anchors: [{ what: "roklina", x0: cx - 30 * s, x1: cx + 30 * s, y: yH + 6 * s }],
    };
  }
  return none;
}

/** Card A for a place: the 96 x 150 strip's picture (no icon: the card puts it on top). */
export function cardScene(id: string, kind: DestinationKind, layers: PackedLayers): SceneGeometry {
  const L = columns(layers, "card");
  return kind === "vrchol" || kind === "hrad" || kind === "vyhliadka" || kind === "chata"
    ? peakScene(kind, L, "card", 96, 150, 100, 0.5, 0.8, 0.75)
    : lowScene(id, kind, L, "card", 96, 150, 100, 0.5, 0.5, 0.75, 134);
}

/** The wide banner (360 x 130, drawn "slice": it fills a wider or taller box from its bottom middle). */
export function bannerScene(id: string, kind: DestinationKind, layers: PackedLayers): SceneGeometry {
  const L = columns(layers, "banner");
  return kind === "vrchol" || kind === "hrad" || kind === "vyhliadka" || kind === "chata"
    ? peakScene(kind, L, "banner", 360, 130, 34, 0.7, 1.3, 0.5)
    : lowScene(id, kind, L, "banner", 360, 130, 18, 0.7, 1, 0.5, 100);
}

/** Entry of public/data/terrain-cards.json: [kind index, near, middle, far]. */
export type CardEntry = [number, ...PackedLayers];

export function cardSvg(id: string, entry: CardEntry): string | null {
  const kind = TERRAIN_KINDS[entry[0]];
  if (!kind) return null;
  return cardScene(id, kind, entry.slice(1) as PackedLayers).svg;
}
