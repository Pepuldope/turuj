// The small drawn map of a place's routes in the visit window (Peter, 25 Nov 2026: a sketch with no map tiles,
// so it shows at once and without signal). Pure: where each line, start dot and name goes inside the box.

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

export interface Sketch { routes: SketchRoute[]; goal: [number, number]; goalLabel: SketchLabel | null; h: number }

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

const round = (n: number) => Math.round(n * 10) / 10;
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const short = (s: string) => (s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1).trimEnd()}…` : s);

/** Lays the routes out in a box `w` pixels wide, north up, the same scale both ways. Routes that run north to south get a taller box (`h`). */
export function routeSketch(routes: readonly SketchInput[], goal: { lat: number; lon: number }, goalName: string, w: number, minH = SKETCH_MIN_H, maxH = SKETCH_MAX_H): Sketch {
  const all = [...routes.flatMap((r) => r.up), [goal.lon, goal.lat] as [number, number]];
  const lats = all.map((p) => p[1]);
  const lons = all.map((p) => p[0]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  // A degree of longitude is shorter than a degree of latitude this far north.
  const k = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const innerW = Math.max(1, w - PAD.left - PAD.right);
  const dx = (east - west) * k;
  const dy = north - south;
  const tall = dx > 0 ? (innerW * dy) / dx + PAD.top + PAD.bottom : maxH;
  const h = Math.round(Math.min(Math.max(tall, minH), maxH));
  const innerH = Math.max(1, h - PAD.top - PAD.bottom);
  const scale = Math.min(dx > 0 ? innerW / dx : Infinity, dy > 0 ? innerH / dy : Infinity);
  const s = Number.isFinite(scale) ? scale : 0;
  const offX = PAD.left + (innerW - dx * s) / 2;
  const offY = PAD.top + (innerH - dy * s) / 2;
  const at = ([lon, lat]: [number, number]): [number, number] => [round(offX + (lon - west) * k * s), round(offY + (north - lat) * s)];

  const lines = routes.map((r) => r.up.map(at));
  const linePoints = lines.flat();
  const taken: Rect[] = [];
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

  const goalAt = at([goal.lon, goal.lat]);
  taken.push({ x: goalAt[0] - GOAL_PIN / 2, y: goalAt[1] - GOAL_PIN / 2, w: GOAL_PIN, h: GOAL_PIN });
  const goalTw = short(goalName).length * LETTER;
  const goalLabel = place(goalName, [
    [goalAt[0] + GOAL_PIN / 2 + 4, goalAt[1] + 4],
    [goalAt[0] - GOAL_PIN / 2 - 4 - goalTw, goalAt[1] + 4],
    [goalAt[0] - goalTw / 2, goalAt[1] - GOAL_PIN / 2 - 5],
    [goalAt[0] - goalTw / 2, goalAt[1] + GOAL_PIN / 2 + 13],
  ]);

  const starts = lines.map((l) => l[0] ?? goalAt);
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

  return { routes: out, goal: goalAt, goalLabel, h };
}
