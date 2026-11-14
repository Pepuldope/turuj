/**
 * "Terén a značky": heights, climb, how much of the walk is marked, the sign colours in walking order,
 * what the difficulty means, the steepest stretch. Elevations come from a DEM that can overstate climbs, so
 * everything is rounded and said as "asi". Pure functions.
 */
import { haversineM } from "@/lib/geo";
import { decimal, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import type { Difficulty, MarkColour, MarkingRun } from "@/lib/tripSchema";

const NB = " ";
type PathPoint = readonly [number, number, number | null];

export interface TerrainInput {
  path: readonly PathPoint[];
  marking_runs: readonly MarkingRun[];
  route: "tam-a-spat" | "okruh";
  ascent_m: number;
  max_ele_m: number | null;
  difficulty: Difficulty;
  /** 0..1 */
  marked_share: number;
}

const round = (n: number, to: number) => Math.round(n / to) * to;

/** Distance from the start to every path point, metres. */
export function cumulative(path: readonly PathPoint[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + haversineM({ lat: path[i - 1][1], lon: path[i - 1][0] }, { lat: path[i][1], lon: path[i][0] }));
  return out;
}

/** Elevations with the gaps filled in from the neighbours; null when too much is missing to say anything. */
function elevations(path: readonly PathPoint[]): number[] | null {
  const known = path.filter((p) => p[2] !== null).length;
  if (path.length < 2 || known < path.length * 0.7) return null;
  const e = path.map((p) => p[2]);
  let last: number | null = null;
  for (let i = 0; i < e.length; i++) {
    if (e[i] !== null) last = e[i];
    else if (last !== null) e[i] = last;
  }
  let next: number | null = null;
  for (let i = e.length - 1; i >= 0; i--) {
    if (e[i] !== null) next = e[i];
    else e[i] = next;
  }
  return e as number[];
}

export interface Steepest {
  /** Climb over the stretch, metres (rounded to 10). */
  gainM: number;
  /** Length of the stretch, metres (rounded to 50). */
  lenM: number;
  /** Where it starts, metres from the start (rounded to 100). */
  atM: number;
  /** Average gradient, per cent. */
  percent: number;
}

const WINDOW_M = 500;
/** Steeper averages are not printed as a percentage. */
const MAX_SHOWN_PERCENT = 35;
/** Gentler than this is not worth calling a steep stretch. */
const STEEP_PERCENT = 10;

/** The steepest ~500 m of climbing along the path, or null when nothing is steep or the heights are missing. */
export function steepestStretch(path: readonly PathPoint[]): Steepest | null {
  const e = elevations(path);
  if (!e) return null;
  const d = cumulative(path);
  let best: { i: number; j: number; gain: number; len: number } | null = null;
  let j = 0;
  for (let i = 0; i < path.length; i++) {
    if (j < i) j = i;
    while (j < path.length - 1 && d[j] - d[i] < WINDOW_M) j++;
    const len = d[j] - d[i];
    if (len < WINDOW_M * 0.9) break;
    const gain = e[j] - e[i];
    if (gain > 0 && (!best || gain / len > best.gain / best.len)) best = { i, j, gain, len };
  }
  if (!best) return null;
  const percent = (best.gain / best.len) * 100;
  if (percent < STEEP_PERCENT || best.gain < 40) return null;
  return { gainM: round(best.gain, 10), lenM: round(best.len, 50), atM: round(d[best.i], 100), percent: Math.round(percent) };
}

/** Runs shorter than this are a crossing of a signed path, not a stretch to follow. */
const MIN_RUN_M = 150;
const COLOUR_NAME: Record<MarkColour, string> = { red: "po červenej", blue: "po modrej", green: "po zelenej", yellow: "po žltej", black: "po čiernej" };

/** The sign colours in walking order, repeats merged, tiny runs and unmarked gaps left out. */
export function markingOrder(path: readonly PathPoint[], runs: readonly MarkingRun[]): MarkColour[] {
  const d = cumulative(path);
  const out: MarkColour[] = [];
  for (const r of runs) {
    if (!r.colour) continue;
    const len = (d[Math.min(r.to, d.length - 1)] ?? 0) - (d[Math.min(r.from, d.length - 1)] ?? 0);
    if (len < MIN_RUN_M) continue;
    if (out[out.length - 1] !== r.colour) out.push(r.colour);
  }
  return out;
}

/** "po žltej, potom po červenej"; more than four are cut with "a ďalšie". Empty when no sign colour is known. */
export function markingText(lang: Lang, colours: MarkColour[]): string {
  if (colours.length === 0) return "";
  const shown = colours.slice(0, 4).map((c) => tr(lang, COLOUR_NAME[c]));
  const joined = shown.join(", " + tr(lang, "potom") + " ");
  return colours.length > 4 ? `${joined} ${tr(lang, "a ďalšie")}` : joined;
}

/** What the marked share of the walk means: "väčšinou značená", "asi 30 % bez značky". Null for a share we cannot read. */
export function markedShareText(lang: Lang, share: number): string | null {
  if (!Number.isFinite(share) || share < 0 || share > 1) return null;
  if (share >= 0.9) return tr(lang, "celá po značke");
  const without = round((1 - share) * 100, 5);
  if (share >= 0.7) return tr(lang, "väčšinou značená, asi {n} % bez značky", { n: without });
  return tr(lang, "veľká časť bez značky ({n} %), držte sa mapy", { n: without });
}

/** The difficulty in plain words, for a normal hiker. */
export function difficultyText(lang: Lang, d: Difficulty): string {
  if (d === "lahka") return tr(lang, "Ľahká: zvládne ju bežný chodec bez zvláštnej prípravy.");
  if (d === "stredna") return tr(lang, "Stredná: dlhšie alebo strmšie úseky, treba trochu kondície a pevnú obuv.");
  return tr(lang, "Ťažká: dlhá alebo strmá túra, treba dobrú kondíciu, turistickú obuv a rezervu času.");
}

export interface Terrain {
  startM: number | null;
  topM: number | null;
  /** Total climb, rounded to 10 m. The way down climbs the same (the walk ends where it began). */
  climbM: number;
  steepest: Steepest | null;
  marking: MarkColour[];
}

export function terrainOf(t: TerrainInput): Terrain {
  const start = t.path[0]?.[2] ?? null;
  const peak = t.max_ele_m ?? t.path.reduce<number | null>((m, p) => (p[2] !== null && (m === null || p[2] > m) ? p[2] : m), null);
  return {
    startM: start === null ? null : round(start, 5),
    topM: peak === null ? null : round(peak, 5),
    climbM: round(t.ascent_m, 10),
    steepest: steepestStretch(t.path),
    marking: markingOrder(t.path, t.marking_runs),
  };
}

const metres = (n: number) => `${n}${NB}m`;

/** "1 210 → 1 480 m n. m., +570 m stúpania". */
export function heightsText(lang: Lang, t: Terrain): string {
  const climb = tr(lang, "stúpanie asi {m}", { m: `+${metres(t.climbM)}` });
  if (t.startM !== null && t.topM !== null && t.topM - t.startM >= 20) return `${t.startM} → ${t.topM}${NB}m ${tr(lang, "n. m.")}, ${climb}`;
  if (t.topM !== null) return `${tr(lang, "najvyššie miesto")} ${t.topM}${NB}m ${tr(lang, "n. m.")}, ${climb}`;
  return climb;
}

/** "Najstrmší úsek: asi 90 m stúpania na 500 m, od 3,2 km (sklon okolo 18 %)". */
export function steepestText(lang: Lang, s: Steepest): string {
  const vars = {
    gain: metres(s.gainM),
    len: s.lenM >= 1000 ? `${decimal(lang, s.lenM / 1000)}${NB}km` : metres(s.lenM),
    km: `${decimal(lang, s.atM / 1000)}${NB}km`,
    p: s.percent,
  };
  // Above ~35 % the heights are mostly DEM noise: the climb over the distance says enough.
  return s.percent > MAX_SHOWN_PERCENT ? tr(lang, "Najstrmší úsek: asi {gain} stúpania na {len}, od {km}.", vars) : tr(lang, "Najstrmší úsek: asi {gain} stúpania na {len}, od {km} (sklon okolo {p} %).", vars);
}

const DIFF_WORD: Record<Difficulty, string> = { lahka: "Ľahká", stredna: "Stredná", tazka: "Ťažká" };

/** Folded line: "Stredná · 1 210 → 1 480 m n. m., stúpanie asi +570 m · po žltej, potom po červenej". */
export function terrainTeaser(lang: Lang, t: TerrainInput, terrain: Terrain): string {
  const parts = [tr(lang, DIFF_WORD[t.difficulty]), heightsText(lang, terrain)];
  const m = markingText(lang, terrain.marking);
  if (m) parts.push(m);
  return parts.join(" · ");
}
