/**
 * The hour strip under "Kedy": one cell per hour of the day's light (wider when the plan reaches
 * outside it), with the forecast for that hour. Pure, so it is unit tested.
 */
import { skyKind, weatherAt } from "@/lib/weather";
import type { SkyKind, WeatherForecast } from "@/lib/weather";
import { wallClock, zonedDate } from "@/lib/zoned";

const HOUR = 3600000;
const MIN = 60000;

export interface HourCell {
  /** Start of the hour, ms. */
  t: number;
  /** Air temperature at the trail start, °C; null where the forecast has no step. */
  temp: number | null;
  /** What the sky does, for the glyph; null without a forecast step. */
  kind: SkyKind | null;
  /** The MET code, for the words. */
  symbol: string | null;
  /** Rain, snow or sleet that hour, mm. */
  rain: number;
  /** "walk": the hike's hours; "way": the ride there or back; "around": the spare hour either side. */
  part: "walk" | "way" | "around";
}

/** The start of the hour that holds `t` (Slovak wall clock; half-hour zones don't exist here). */
export function hourStart(t: number): number {
  const w = wallClock(t);
  return zonedDate(w.y, w.mo, w.d, w.h, 0).getTime();
}

/**
 * The hours from `range.from` to `range.to`, each with its forecast step (the steps are hourly for two
 * days, then 6-hourly: those hours share the step, its rain spread over its hours). The range is the
 * day's, not the plan's, so tapping an hour doesn't move the strip. The walk is the hours whose middle
 * falls in [hikeStart, hikeEnd]; the way is the rest of [leave, home].
 */
export function hourStrip(
  forecast: WeatherForecast,
  range: { from: Date; to: Date },
  leave: Date,
  hikeStart: Date,
  hikeEnd: Date,
  home: Date
): HourCell[] {
  const first = hourStart(range.from.getTime());
  const last = hourStart(range.to.getTime());
  const cells: HourCell[] = [];
  for (let t = first; t <= last; t = hourStart(t + HOUR + 30 * MIN)) {
    const mid = t + 30 * MIN;
    const step = weatherAt(forecast, t);
    const part: HourCell["part"] =
      mid >= hikeStart.getTime() && mid <= hikeEnd.getTime() ? "walk" : mid >= leave.getTime() && mid <= home.getTime() ? "way" : "around";
    cells.push({
      t,
      temp: step ? Math.round(step.temp) : null,
      kind: step ? skyKind(step.symbol) : null,
      symbol: step?.symbol ?? null,
      rain: step ? step.rain / step.hours : 0,
      part,
    });
  }
  return cells;
}

/** The index of the hour the walk starts in (the nearest hour to the start), or -1 when none is shown. */
export function startHourIndex(cells: HourCell[], hikeStart: Date): number {
  let best = -1;
  let gap = Infinity;
  cells.forEach((c, i) => {
    const d = Math.abs(c.t - hikeStart.getTime());
    if (d < gap) {
      gap = d;
      best = i;
    }
  });
  return best;
}

/**
 * The departure (HH:MM, to 5 minutes) that makes the walk start at the top of hour `t`, keeping
 * the ride as it is now: `lead` is the ms from leaving to the start of the walk.
 */
export function departureFor(t: number, lead: number): string {
  const at = Math.round((t - lead) / (5 * MIN)) * 5 * MIN;
  const w = wallClock(at);
  return `${String(w.h).padStart(2, "0")}:${String(w.mi).padStart(2, "0")}`;
}

/** Whether the hour is dark: its middle is before sunrise or after sunset. */
export function isDarkHour(t: number, sunrise: Date, sunset: Date): boolean {
  const mid = t + 30 * MIN;
  return mid < sunrise.getTime() || mid > sunset.getTime();
}

/** How much rain the hour has, for the track's shading: 0 none, 1 light (< 0.5 mm), 2 moderate (< 2 mm), 3 heavy. */
export function rainStrength(mm: number): 0 | 1 | 2 | 3 {
  if (mm < 0.05) return 0;
  return mm < 0.5 ? 1 : mm < 2 ? 2 : 3;
}

/** Where `t` falls between `from` and `to`, 0..1 (not clamped). */
export function timeFraction(t: number, from: number, to: number): number {
  return (t - from) / (to - from);
}

/** `t` rounded to the nearest `stepMin` minutes. */
export function snapTime(t: number, stepMin = 15): number {
  const step = stepMin * MIN;
  return Math.round(t / step) * step;
}

/** The walk's start kept so that a walk `len` ms long stays inside [from, to]. */
export function clampStart(start: number, len: number, from: number, to: number): number {
  return Math.min(Math.max(start, from), Math.max(from, to - len));
}

/** warn: rain, snow or sleet; danger: a storm or heavy rain or snow. */
export type BadLevel = "warn" | "danger";

/** How bad the hour's weather is for a walk; null when it is nothing to warn about. */
export function badLevel(c: HourCell): BadLevel | null {
  if (c.kind === "thunder" || c.kind === "heavyrain" || c.kind === "heavysnow" || c.rain >= 2) return "danger";
  if (c.rain >= 0.05 || c.kind === "lightrain" || c.kind === "rain" || c.kind === "sleet" || c.kind === "lightsnow" || c.kind === "snow") return "warn";
  return null;
}

/** For each hour the walk [from, to) touches, how bad its weather is; null for hours outside the walk or with nothing bad. */
export function badHoursInSpan(cells: HourCell[], from: number, to: number): (BadLevel | null)[] {
  return cells.map((c) => (c.t < to && c.t + HOUR > from ? badLevel(c) : null));
}

/** Worse sky first, for picking the one glyph that stands for the walk. */
const KIND_ORDER: SkyKind[] = ["thunder", "heavysnow", "snow", "sleet", "heavyrain", "rain", "lightsnow", "lightrain", "fog", "cloudy", "partly", "fair", "clear"];

/** The worst sky among the walk's hours; null when none has a forecast. */
export function worstWalkKind(cells: HourCell[]): SkyKind | null {
  let best: SkyKind | null = null;
  for (const c of cells) {
    if (c.part !== "walk" || !c.kind) continue;
    if (best === null || KIND_ORDER.indexOf(c.kind) < KIND_ORDER.indexOf(best)) best = c.kind;
  }
  return best;
}
