/**
 * Weather for the hours of the walk, from MET Norway's Locationforecast
 * (api.met.no, CC BY 4.0; fetched and cached by /api/weather). Pure, so the
 * summary is unit tested.
 */
import { daysBetween, isoDate } from "@/lib/days";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { clockShort, wallClock, zonedDate } from "@/lib/zoned";

/** One forecast step, trimmed to what we show. */
export interface WeatherStep {
  /** ISO time of the step. */
  t: string;
  /** Air temperature, °C. */
  temp: number;
  /** Wind speed, m/s. */
  wind: number;
  /** Precipitation in the following period, mm. */
  rain: number;
  /** Length of that period in hours (1 for the first ~2 days, then 6). */
  hours: number;
  /** MET symbol code, e.g. "partlycloudy_day", or null at the end of the range. */
  symbol: string | null;
}

export interface WeatherForecast {
  updated: string;
  steps: WeatherStep[];
}

export interface WeatherSummary {
  tempMin: number;
  tempMax: number;
  windMax: number;
  rainMm: number;
  /** The most significant weather in the window, as a symbol code without _day/_night. */
  symbol: string;
}

/** How far ahead MET forecasts (about 9 days). */
export const FORECAST_DAYS = 9;

const HOUR = 3600000;

/** Worse weather first: the summary shows the worst thing the walk will meet. */
const SEVERITY = [
  "thunder",
  "heavysnow",
  "snow",
  "heavysleet",
  "sleet",
  "heavyrain",
  "rain",
  "lightsnow",
  "lightsleet",
  "lightrain",
  "fog",
  "cloudy",
  "partlycloudy",
  "fair",
  "clearsky",
];

/**
 * Rank of a MET code. The longest name it contains decides ("lightrainshowers"
 * is light rain, not rain; "partlycloudy" is not "cloudy"), except that any
 * thunder ("rainandthunder") counts as thunder.
 */
function severity(code: string): number {
  if (code.includes("thunder")) return 0;
  let best = -1;
  SEVERITY.forEach((s, i) => {
    if (code.includes(s) && (best < 0 || s.length > SEVERITY[best].length)) best = i;
  });
  return best < 0 ? SEVERITY.length : best;
}

/** "lightrainshowers_day" -> "lightrainshowers". */
export function baseSymbol(code: string): string {
  return code.replace(/_(day|night|polartwilight)$/, "");
}

/** Summary of the steps that overlap [from, to]; null when the forecast doesn't reach that far. */
export function summarize(forecast: WeatherForecast, from: Date, to: Date): WeatherSummary | null {
  const a = from.getTime();
  const b = to.getTime();
  const steps = forecast.steps.filter((s) => {
    const t = new Date(s.t).getTime();
    // A step that starts as the walk ends is not part of it.
    return t < b && t + s.hours * HOUR > a;
  });
  if (steps.length === 0) return null;
  const last = steps[steps.length - 1];
  if (new Date(last.t).getTime() + last.hours * HOUR < b) return null;

  let rain = 0;
  for (const s of steps) {
    const t = new Date(s.t).getTime();
    const overlap = Math.min(b, t + s.hours * HOUR) - Math.max(a, t);
    rain += s.rain * Math.max(0, overlap) / (s.hours * HOUR);
  }
  const symbols = steps.map((s) => s.symbol).filter((c): c is string => c !== null);
  const worst = symbols.sort((x, y) => severity(x) - severity(y))[0] ?? "cloudy";
  return {
    tempMin: Math.round(Math.min(...steps.map((s) => s.temp))),
    tempMax: Math.round(Math.max(...steps.map((s) => s.temp))),
    windMax: Math.round(Math.max(...steps.map((s) => s.wind))),
    rainMm: Math.round(rain * 10) / 10,
    symbol: baseSymbol(worst),
  };
}

/** Slovak words for the MET symbols (base code, no _day/_night). */
const WORDS: [string, string][] = [
  ["thunder", "búrky"],
  ["heavysnow", "husté sneženie"],
  ["lightsnow", "slabé sneženie"],
  ["snow", "sneženie"],
  ["heavysleet", "silný dážď so snehom"],
  ["lightsleet", "slabý dážď so snehom"],
  ["sleet", "dážď so snehom"],
  ["heavyrain", "silný dážď"],
  ["lightrain", "slabý dážď"],
  ["rain", "dážď"],
  ["fog", "hmla"],
  ["partlycloudy", "polojasno"],
  ["cloudy", "zamračené"],
  ["fair", "prevažne jasno"],
  ["clearsky", "jasno"],
];

export function weatherWords(symbol: string, lang: Lang = "sk"): string {
  const showers = symbol.includes("showers") ? tr(lang, " (prehánky)") : "";
  // "heavyrainandthunder" is a storm first.
  const hit = WORDS.find(([k]) => (k === "thunder" ? symbol.includes(k) : symbol.startsWith(k)));
  return tr(lang, hit ? hit[1] : "premenlivo") + showers;
}

/** The weather of one forecast step, as the sun dial draws it. */
export type SkyKind =
  | "clear"
  | "fair"
  | "partly"
  | "cloudy"
  | "fog"
  | "lightrain"
  | "rain"
  | "heavyrain"
  | "sleet"
  | "lightsnow"
  | "snow"
  | "heavysnow"
  | "thunder";

/** MET symbol code -> what to draw; checked in this order ("lightrainshowers" is light rain). */
const KINDS: [string, SkyKind][] = [
  ["thunder", "thunder"],
  ["heavysnow", "heavysnow"],
  ["lightsnow", "lightsnow"],
  ["snow", "snow"],
  ["sleet", "sleet"],
  ["heavyrain", "heavyrain"],
  ["lightrain", "lightrain"],
  ["rain", "rain"],
  ["fog", "fog"],
  ["partlycloudy", "partly"],
  ["cloudy", "cloudy"],
  ["fair", "fair"],
  ["clearsky", "clear"],
];

export function skyKind(symbol: string | null): SkyKind | null {
  if (!symbol) return null;
  const hit = KINDS.find(([k]) => symbol.includes(k));
  return hit ? hit[1] : "cloudy";
}

/** The forecast step that covers `t` (ms), or null outside the forecast. */
export function weatherAt(forecast: WeatherForecast, t: number): WeatherStep | null {
  return (
    forecast.steps.find((s) => {
      const a = new Date(s.t).getTime();
      return a <= t && t < a + s.hours * HOUR;
    }) ?? null
  );
}

/** Air cools about this much per metre of climb (standard lapse rate). */
export const LAPSE_PER_M = 0.0065;

export interface WeatherNote {
  text: string;
  /** Storms, heavy rain, heavy snow: dangerous on a mountain. Wind and frost are light notes. */
  strong: boolean;
}

const hhmm = clockShort;

/**
 * Short warnings for the hours of the walk, worst first, the way the sunset
 * notes work: one line each, never a blocker. `top` is the forecast for the
 * goal's height, when there is one (wind and frost are worse up there).
 */
export function weatherNotes(below: WeatherForecast, top: WeatherForecast | null, from: Date, to: Date, lang: Lang = "sk"): WeatherNote[] {
  const a = from.getTime();
  const b = to.getTime();
  const during = (f: WeatherForecast) =>
    f.steps.filter((s) => {
      const t = new Date(s.t).getTime();
      return t < b && t + s.hours * HOUR > a && s.symbol !== null;
    });
  const steps = during(below);
  // "14:00–16:00": when it happens, clipped to the walk.
  const when = (hit: (s: WeatherStep) => boolean): string | null => {
    const h = steps.filter(hit);
    if (h.length === 0) return null;
    const last = h[h.length - 1];
    return `${hhmm(Math.max(a, new Date(h[0].t).getTime()))}–${hhmm(Math.min(b, new Date(last.t).getTime() + last.hours * HOUR))}`;
  };
  const kind = (s: WeatherStep) => skyKind(s.symbol);

  const out: WeatherNote[] = [];
  const thunder = when((s) => kind(s) === "thunder");
  if (thunder) out.push({ text: tr(lang, "Búrky {when}. Na hrebeni a vrchole nebezpečné, buďte dole skôr.", { when: thunder }), strong: true });
  const heavy = when((s) => kind(s) === "heavyrain" || s.rain / s.hours >= 4);
  if (heavy && !thunder) out.push({ text: tr(lang, "Silný dážď {when}. Chodník bude šmykľavý.", { when: heavy }), strong: true });
  const snow = when((s) => kind(s) === "heavysnow");
  if (snow) out.push({ text: tr(lang, "Husté sneženie {when}, značky aj chodník môžu zmiznúť pod snehom.", { when: snow }), strong: true });

  const up = top ? during(top) : [];
  const all = up.length ? up : steps;
  const wind = Math.round(Math.max(0, ...all.map((s) => s.wind)));
  if (wind >= 15) out.push({ text: tr(lang, "Silný vietor (do {wind} m/s), na hrebeni ešte silnejší.", { wind }), strong: false });
  const cold = Math.min(...all.map((s) => s.temp));
  if (cold <= 0 && !snow) out.push({ text: tr(lang, "Mráz: chodník môže byť zľadovatený."), strong: false });
  return out;
}

export interface TripWeatherReport {
  /** Temperature range down at the start for the whole window, °C. */
  tempMin: number;
  tempMax: number;
  /** Coldest up at the goal during the walk, when it is clearly colder than below. */
  topMin: number | null;
  /** The worst weather of the window, in words ("slabý dážď"). */
  worst: string;
  /** When the worst weather comes ("13:00–15:00"); null when it is the whole time or it is fine weather. */
  worstWhen: string | null;
  /** Any rain, sleet or snow at all: when and the most per hour. */
  wet: { when: string; mmPerHour: number; snow: boolean; sleet: boolean } | null;
}

/**
 * The whole picture for the trip window [from, to]: temperature range, the
 * worst weather and when, and any rain at all (even one light hour). MET
 * Norway gives no chance of rain for Slovakia, only the expected amount, so
 * rain is reported with its hours and amount instead of a percentage.
 * `walk` is the part on the trail, where the goal's colder air counts.
 */
export function tripWeatherReport(
  below: WeatherForecast,
  top: WeatherForecast | null,
  from: Date,
  to: Date,
  walk: { from: Date; to: Date } = { from, to },
  lang: Lang = "sk"
): TripWeatherReport | null {
  const a = from.getTime();
  const b = to.getTime();
  const inside = (f: WeatherForecast, x: number, y: number) =>
    f.steps.filter((s) => {
      const t = new Date(s.t).getTime();
      return t < y && t + s.hours * HOUR > x && s.symbol !== null;
    });
  const steps = inside(below, a, b);
  if (steps.length === 0) return null;
  const last = steps[steps.length - 1];
  if (new Date(last.t).getTime() + last.hours * HOUR < b) return null;
  const span = (h: WeatherStep[]) =>
    `${hhmm(Math.max(a, new Date(h[0].t).getTime()))}–${hhmm(Math.min(b, new Date(h[h.length - 1].t).getTime() + h[h.length - 1].hours * HOUR))}`;

  const worstCode = steps.map((s) => s.symbol!).sort((x, y) => severity(x) - severity(y))[0];
  const worstSteps = steps.filter((s) => severity(s.symbol!) === severity(worstCode));
  const wetSteps = steps.filter((s) => s.rain > 0.05 || /rain|sleet|snow|thunder/.test(s.symbol!));
  const up = top ? inside(top, walk.from.getTime(), walk.to.getTime()) : [];
  const tempMin = Math.round(Math.min(...steps.map((s) => s.temp)));
  const topMin = up.length ? Math.round(Math.min(...up.map((s) => s.temp))) : null;

  return {
    tempMin,
    tempMax: Math.round(Math.max(...steps.map((s) => s.temp))),
    topMin: topMin !== null && topMin < tempMin - 1 ? topMin : null,
    worst: weatherWords(baseSymbol(worstCode), lang),
    // "Najhoršie prevažne jasno" says nothing: fine weather gets no hours.
    worstWhen: worstSteps.length === steps.length || severity(worstCode) > SEVERITY.indexOf("cloudy") ? null : span(worstSteps),
    wet: wetSteps.length
      ? {
          when: span(wetSteps),
          mmPerHour: Math.round(Math.max(...wetSteps.map((s) => s.rain / s.hours)) * 10) / 10,
          snow: wetSteps.every((s) => /snow/.test(s.symbol!)),
          sleet: wetSteps.some((s) => /sleet/.test(s.symbol!)),
        }
      : null,
  };
}

/** The same Slovak clock time `n` calendar days later (a plain +24 h would slip an hour across a clock change). */
export function shiftDays(d: Date, n: number): Date {
  const w = wallClock(d);
  return zonedDate(w.y, w.mo, w.d + n, w.h, w.mi);
}

/** Rain, sleet or snow during the walk, or a storm/heavy-weather warning: the day the trip page warns about. */
export function wetWalk(below: WeatherForecast, top: WeatherForecast | null, from: Date, to: Date): boolean {
  const r = tripWeatherReport(below, top, from, to);
  return !!r && (!!r.wet || weatherNotes(below, top, from, to).some((n) => n.strong));
}

export interface BetterDay {
  /** Calendar days from the planned day (negative: an earlier day that is still ahead). */
  offset: number;
  /** The walk's weather that day, for "polojasno, 7 až 11 °C". */
  summary: WeatherSummary;
}

export interface BetterDayCheck {
  /** Minutes from leaving to the start of the walk: the departure, not the walk, must still be ahead of `now`. */
  leadMin?: number;
  /** The walk [from, to] moved to another day still works there: daylight, no closure. */
  fits?: (from: Date, to: Date) => boolean;
}

/**
 * When the walk would be wet, the nearest day in the forecast with a dry walk at
 * the same clock time: one day later, one earlier (if the departure is still
 * ahead of `now`), two later... Days `check.fits` turns down (too dark by
 * then, trail closed) are skipped. Null when the planned day is fine or no day
 * in range is better.
 */
export function betterDay(
  below: WeatherForecast,
  top: WeatherForecast | null,
  from: Date,
  to: Date,
  now: Date,
  check: BetterDayCheck = {}
): BetterDay | null {
  if (!wetWalk(below, top, from, to)) return null;
  const lead = (check.leadMin ?? 0) * 60000;
  for (let step = 1; step < FORECAST_DAYS; step++) {
    for (const offset of [step, -step]) {
      const a = shiftDays(from, offset);
      const b = shiftDays(to, offset);
      if (a.getTime() - lead < now.getTime() || !tripWeatherReport(below, top, a, b)) continue;
      if (check.fits && !check.fits(a, b)) continue;
      if (wetWalk(below, top, a, b)) continue;
      const summary = summarize(below, a, b);
      if (summary) return { offset, summary };
    }
  }
  return null;
}

export interface BetterTime {
  /** Minutes to move the whole day by (negative: earlier). */
  shiftMin: number;
  /** The walk's weather at that time. */
  summary: WeatherSummary;
}

/** How far the same-day search looks, each way, in half-hour steps. */
const TIME_STEP_MIN = 30;
const TIME_STEPS = 16;

/**
 * When the walk would be wet, the nearest start on the same day (half an hour
 * either way, then an hour...) with a dry walk that still fits in the window:
 * `earliest` is the first allowed walk start (sunrise, and late enough to get
 * there from now), `latest` the last allowed walk end (before sunset).
 */
export function betterTime(
  below: WeatherForecast,
  top: WeatherForecast | null,
  from: Date,
  to: Date,
  window: { earliest: Date; latest: Date }
): BetterTime | null {
  if (!wetWalk(below, top, from, to)) return null;
  for (let step = 1; step <= TIME_STEPS; step++) {
    for (const shiftMin of [step * TIME_STEP_MIN, -step * TIME_STEP_MIN]) {
      const a = new Date(from.getTime() + shiftMin * 60000);
      const b = new Date(to.getTime() + shiftMin * 60000);
      if (a < window.earliest || b > window.latest || wallClock(a).d !== wallClock(from).d) continue;
      if (!tripWeatherReport(below, top, a, b) || wetWalk(below, top, a, b)) continue;
      const summary = summarize(below, a, b);
      if (summary) return { shiftMin, summary };
    }
  }
  return null;
}

/** Weather worth a symbol in the day strip: anything that wets the walk, fog and storms. */
export type BadSky = "rain" | "sleet" | "snow" | "fog" | "thunder";

const BAD_SKY: Partial<Record<SkyKind, BadSky>> = {
  lightrain: "rain",
  rain: "rain",
  heavyrain: "rain",
  sleet: "sleet",
  lightsnow: "snow",
  snow: "snow",
  heavysnow: "snow",
  fog: "fog",
  thunder: "thunder",
};

/**
 * For each day (YYYY-MM-DD) in the forecast range: the worst weather during a
 * walk at the same clock time as [from, to], when it is rain, sleet, snow, fog
 * or a storm. Fine days and days past the forecast are left out, so the strip
 * only marks the days to think twice about.
 */
export function badDays(forecast: WeatherForecast, from: Date, to: Date, days: string[]): Record<string, BadSky> {
  const base = isoDate(from);
  const out: Record<string, BadSky> = {};
  for (const iso of days) {
    const offset = daysBetween(base, iso);
    const s = summarize(forecast, shiftDays(from, offset), shiftDays(to, offset));
    const bad = s && BAD_SKY[skyKind(s.symbol)!];
    if (bad) out[iso] = bad;
  }
  return out;
}
