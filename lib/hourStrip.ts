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

/** `t` rounded to the nearest `stepMin` minutes. */
export function snapTime(t: number, stepMin = 15): number {
  const step = stepMin * MIN;
  return Math.round(t / step) * step;
}
