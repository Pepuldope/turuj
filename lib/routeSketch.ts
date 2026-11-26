// The small map of a place's routes in the visit window. Pure: where each line, start dot and name goes inside
// the box, and which piece of the real map lies under it. Peter, 25 Nov 2026: a drawing, so it shows at once and
// without signal; 26 Nov: with the map under it, "on a blank background it is hard to work out". The lines are
// laid out in the map's own projection (Web Mercator), so the map behind them needs only a centre and a zoom.

export interface SketchInput {
  slug: string;
  startName: string;
  /** The way up as [lon, lat]; the whole loop for a loop route. */
  up: [number, number][];
}

export interface SketchLabel { text: string; x: number; y: number }

export interface SketchRoute {
  slug: string;
  /** SVG path of the line, in the box's pixels. */
  path: string;
  start: [number, number];
  /** The start's name; null when another route already names this start or there is no free room for it. */
  label: SketchLabel | null;
}

/** The map that fits under the box exactly: its centre and its zoom (512 px tiles, as MapLibre counts). */
export interface SketchView { lon: number; lat: number; zoom: number }

/** A corner of the box, as MapLibre names the places of its controls. */
export type SketchCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface Sketch {
  routes: SketchRoute[];
  goal: [number, number];
  goalLabel: SketchLabel | null;
  h: number;
  view: SketchView;
  /** Where the map's credit goes: the corner with the least of the routes in it. */
  credit: SketchCorner;
}

/** The box is as wide as the window lets it be; its height follows the shape of the routes, within these. */
export const SKETCH_MIN_H = 170;
export const SKETCH_MAX_H = 230;

interface Rect { x: number; y: number; w: number; h: number }

const PAD = { left: 18, right: 18, top: 24, bottom: 26 };
const LABEL_H = 14;
const LABEL_MAX = 24;
/** Width of one letter of the 11.5 px bold label, on average. */
const LETTER = 6.3;
const EDGE = 4;
const GOAL_PIN = 22;
/** Pixels of one degree of longitude at zoom 0, and the closest the sketch zooms in (a short route is not blown up past it). */
const WORLD_PX_PER_DEGREE = 512 / 360;
const MAX_ZOOM = 16;
/** With nothing to measure (one point), a zoom that shows the surroundings. */
const LONE_ZOOM = 13;

/** Web Mercator's north-south axis, in the same units as degrees of longitude. */
const mercY = (lat: number) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp((y * Math.PI) / 180)) - 90;

const round = (n: number) => Math.round(n * 10) / 10;
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const short = (s: string) => (s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1).trimEnd()}…` : s);

/**
 * Lays the routes out in a box `w` pixels wide, north up, the same scale both ways. Routes that run north to south
 * get a taller box (`h`). `corner` is the size of the map's credit: it gets the corner with the least of the
 * routes in it (`credit`), and no name is put there.
 */
export function routeSketch(
  routes: readonly SketchInput[],
  goal: { lat: number; lon: number },
  goalName: string,
  w: number,
  minH = SKETCH_MIN_H,
  maxH = SKETCH_MAX_H,
  corner: { w: number; h: number } = { w: 0, h: 0 },
): Sketch {
  const all = [...routes.flatMap((r) => r.up), [goal.lon, goal.lat] as [number, number]];
  const ys = all.map((p) => mercY(p[1]));
  const lons = all.map((p) => p[0]);
  const south = Math.min(...ys);
  const north = Math.max(...ys);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const innerW = Math.max(1, w - PAD.left - PAD.right);
  const dx = east - west;
  const dy = north - south;
  const tall = dx > 0 ? (innerW * dy) / dx + PAD.top + PAD.bottom : maxH;
  const h = Math.round(Math.min(Math.max(tall, minH), maxH));
  const innerH = Math.max(1, h - PAD.top - PAD.bottom);
  const fit = Math.min(dx > 0 ? innerW / dx : Infinity, dy > 0 ? innerH / dy : Infinity);
  // Pixels per degree of longitude.
  const s = Math.min(Number.isFinite(fit) ? fit : WORLD_PX_PER_DEGREE * 2 ** LONE_ZOOM, WORLD_PX_PER_DEGREE * 2 ** MAX_ZOOM);
  const offX = PAD.left + (innerW - dx * s) / 2;
  const offY = PAD.top + (innerH - dy * s) / 2;
  const at = ([lon, lat]: [number, number]): [number, number] => [round(offX + (lon - west) * s), round(offY + (north - mercY(lat)) * s)];
  // What the middle of the box shows: the map behind is centred there, at the zoom that has this scale.
  const view: SketchView = { lon: west + (w / 2 - offX) / s, lat: latOf(north - (h / 2 - offY) / s), zoom: Math.log2(s / WORLD_PX_PER_DEGREE) };

  const lines = routes.map((r) => r.up.map(at));
  const linePoints = lines.flat();
  const starts = lines.map((l) => l[0] ?? at([goal.lon, goal.lat]));
  const goalAt = at([goal.lon, goal.lat]);
  // The credit's corner: a start or the goal under it would be hidden, a piece of a line only crossed.
  const CORNERS: SketchCorner[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
  const cornerRect = (c: SketchCorner): Rect => ({ x: c.endsWith("right") ? w - corner.w : 0, y: c.startsWith("bottom") ? h - corner.h : 0, w: corner.w, h: corner.h });
  const near = (r: Rect, [px, py]: [number, number], by: number) => px > r.x - by && px < r.x + r.w + by && py > r.y - by && py < r.y + r.h + by;
  const cost = (c: SketchCorner) => {
    const r = cornerRect(c);
    return linePoints.filter((q) => near(r, q, 3)).length + 1000 * [...starts, goalAt].filter((q) => near(r, q, 8)).length;
  };
  const credit = CORNERS.reduce((best, c) => (cost(c) < cost(best) ? c : best), CORNERS[0]);
  const taken: Rect[] = corner.w > 0 && corner.h > 0 ? [cornerRect(credit)] : [];
  const fits = (r: Rect) => r.y >= 1 && r.y + r.h <= h - 1 && !taken.some((t) => hits(t, r));
  /**
   * Of the candidate spots (left edge x, baseline y) that are free, the one lying over the least of the lines,
   * the earlier one on a tie; the text is kept inside the box sideways.
   */
  const place = (name: string, spots: [number, number][]): SketchLabel | null => {
    const text = short(name);
    const tw = text.length * LETTER;
    let best: { rect: Rect; label: SketchLabel; over: number } | null = null;
    for (const [x0, y0] of spots) {
      const x = round(Math.min(Math.max(x0, EDGE), Math.max(EDGE, w - EDGE - tw)));
      const y = round(y0);
      const rect = { x: x - 2, y: y - LABEL_H + 3, w: tw + 4, h: LABEL_H };
      if (!fits(rect)) continue;
      const over = linePoints.filter(([px, py]) => px > rect.x - 2 && px < rect.x + rect.w + 2 && py > rect.y - 2 && py < rect.y + rect.h + 2).length;
      if (!best || over < best.over) best = { rect, label: { text, x, y }, over };
      if (over === 0) break;
    }
    if (!best) return null;
    taken.push(best.rect);
    return best.label;
  };
  const around = ([x, y]: [number, number], name: string, gap: number): [number, number][] => {
    const tw = short(name).length * LETTER;
    return [
      [x - tw / 2, y + gap + 11],
      [x - tw / 2, y - gap - 3],
      [x + gap + 3, y + 4],
      [x - gap - 3 - tw, y + 4],
    ];
  };

  taken.push({ x: goalAt[0] - GOAL_PIN / 2, y: goalAt[1] - GOAL_PIN / 2, w: GOAL_PIN, h: GOAL_PIN });
  const goalTw = short(goalName).length * LETTER;
  const goalLabel = place(goalName, [
    [goalAt[0] + GOAL_PIN / 2 + 4, goalAt[1] + 4],
    [goalAt[0] - GOAL_PIN / 2 - 4 - goalTw, goalAt[1] + 4],
    [goalAt[0] - goalTw / 2, goalAt[1] - GOAL_PIN / 2 - 5],
    [goalAt[0] - goalTw / 2, goalAt[1] + GOAL_PIN / 2 + 13],
  ]);

  // No name may sit on another route's start dot.
  for (const [x, y] of starts) taken.push({ x: x - 6, y: y - 6, w: 12, h: 12 });

  const out: SketchRoute[] = routes.map((r, i) => {
    let path = "";
    let last: [number, number] | null = null;
    lines[i].forEach((q, j) => {
      // Points closer than two pixels add nothing to a line this small.
      if (last && j < r.up.length - 1 && Math.hypot(q[0] - last[0], q[1] - last[1]) < 2) return;
      path += `${last ? "L" : "M"}${q[0]} ${q[1]}`;
      last = q;
    });
    const start = starts[i];
    const named = routes.slice(0, i).some((o, j) => o.startName === r.startName && Math.hypot(starts[j][0] - start[0], starts[j][1] - start[1]) < 10);
    return { slug: r.slug, path, start, label: named ? null : place(r.startName, around(start, r.startName, 7)) };
  });

  return { routes: out, goal: goalAt, goalLabel, h, view, credit };
}
