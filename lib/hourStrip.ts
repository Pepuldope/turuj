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

/** Rain height in the cell, 0..1: 2 mm an hour fills it; any rain at all shows a sliver. */
export function rainFill(mm: number): number {
  if (mm < 0.05) return 0;
  return Math.max(0.12, Math.min(1, mm / 2));
}
