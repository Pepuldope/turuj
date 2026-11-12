/**
 * The numbers behind the "Kedy" step (Peter picked mockup round 6, M1, on 2026-11-12): a trip bar and an
 * hour row on ONE fixed 6:00-20:00 scale that never stretches with the chosen time, the option cards, the
 * warnings with their way out, and the folded summary. Pure and JSX-free, so it is unit tested; the words
 * come from components/KedyStep.tsx.
 *
 * Every time here is the WALK START (Peter, 2026-11-12), never the departure.
 */
import type { DayPlan, Segment, SegmentKind } from "@/lib/dayPlan";
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import { floorTo5 } from "@/lib/days";
import { badHoursInSpan } from "@/lib/hourStrip";
import type { BadLevel, HourCell } from "@/lib/hourStrip";
import { FORECAST_DAYS, betterDay, betterTime, skyKind, summarize, tripWeatherReport, weatherAt, weatherNotes, wetWalk } from "@/lib/weather";
import type { SkyKind, WeatherForecast } from "@/lib/weather";
import { clock, clockShort, wallClock, zonedDate } from "@/lib/zoned";

const MIN = 60000;
const HOUR = 3600000;

/** The fixed scale, minutes after midnight: 14 hour cells, 6:00 to 20:00 (the last cell is the "19" one). */
export const SCALE_FROM_MIN = 6 * 60;
export const SCALE_TO_MIN = 20 * 60;
const SPAN = SCALE_TO_MIN - SCALE_FROM_MIN;
/** The hour numbers of the row. */
export const SCALE_HOURS = Array.from({ length: SPAN / 60 }, (_, i) => SCALE_FROM_MIN / 60 + i);

/** Minutes after midnight of the calendar day of `ref` (Slovak clock); more than 1440 on a later day. */
export function dayMinutes(at: Date | number, ref: Date | number): number {
  const a = wallClock(at);
  const r = wallClock(ref);
  const days = Math.round((Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(r.y, r.mo - 1, r.d)) / 86400000);
  return days * 1440 + a.h * 60 + a.mi;
}

/** Where a minute of the day falls on the scale, 0..1, clamped: segments outside 6-20 are cut at the edge. */
export function scalePos(min: number): number {
  return Math.min(1, Math.max(0, (min - SCALE_FROM_MIN) / SPAN));
}

/** "HH:MM" <-> minutes after midnight. */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function minToHhmm(min: number): string {
  const m = Math.min(1439, Math.max(0, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The ms from leaving to the start of the walk (the ride there, or the wait at the stop). */
export function leadMs(plan: DayPlan): number {
  return plan.hikeStart.getTime() - plan.segments[0].start.getTime();
}

/**
 * `plan.latestStart` is the latest DEPARTURE (or the walk itself with no ride); this is the walk start that
 * goes with it, to 5 minutes before, so "Najneskôr začnite túru o 8:20" is on the same clock as the field.
 */
export function latestWalkStart(plan: DayPlan): Date {
  return floorTo5(new Date(plan.latestStart.getTime() + leadMs(plan)));
}

// ---------------------------------------------------------------------------------------------------------
// Trip bar

export type PieceTone = "base" | "rain" | "storm" | "dark";

export interface BarPiece {
  /** Left edge and width as fractions of the whole scale (0..1), already clamped. */
  left: number;
  width: number;
  tone: PieceTone;
}

export interface BarSegment {
  kind: SegmentKind;
  /** Minutes after midnight, not clamped. */
  fromMin: number;
  toMin: number;
  left: number;
  width: number;
  pieces: BarPiece[];
}

/** The hours of the hike with rain or snow, for the amber parts of the bar. */
function wetSpans(cells: HourCell[], plan: DayPlan): { from: number; to: number; level: BadLevel }[] {
  const bad = badHoursInSpan(cells, plan.hikeStart.getTime(), plan.hikeEnd.getTime());
  return cells.flatMap((c, i) => {
    const level = bad[i];
    if (!level) return [];
    const from = Math.max(c.t, plan.hikeStart.getTime());
    const to = Math.min(c.t + HOUR, plan.hikeEnd.getTime());
    return to > from ? [{ from: dayMinutes(from, plan.hikeStart), to: dayMinutes(to, plan.hikeStart), level }] : [];
  });
}

/**
 * The legs of the day as boxes on the fixed scale. Each is cut into pieces where the sun sets or rises (hatched
 * amber: in the dark) and, for the hike, where rain or snow falls (amber). Pieces that fall outside the scale
 * are dropped; nothing here depends on the chosen time except where the boxes sit.
 */
export function barSegments(plan: DayPlan, cells: HourCell[]): BarSegment[] {
  const rise = dayMinutes(plan.sunrise, plan.hikeStart);
  const set = dayMinutes(plan.sunset, plan.hikeStart);
  const wet = wetSpans(cells, plan);
  return plan.segments.map((seg: Segment) => {
    const a = dayMinutes(seg.start, plan.hikeStart);
    const b = dayMinutes(seg.end, plan.hikeStart);
    const own = seg.kind === "hike" ? wet : [];
    const cuts = [...new Set([a, b, rise, set, ...own.flatMap((w) => [w.from, w.to])].filter((x) => x >= a && x <= b))].sort((x, y) => x - y);
    const pieces: BarPiece[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const [x, y] = [cuts[i], cuts[i + 1]];
      const mid = (x + y) / 2;
      const hit = own.find((w) => mid > w.from && mid < w.to);
      const tone: PieceTone = mid < rise || mid > set ? "dark" : hit ? (hit.level === "danger" ? "storm" : "rain") : "base";
      const left = scalePos(x);
      const width = scalePos(y) - left;
      if (width <= 0) continue;
      const last = pieces[pieces.length - 1];
      if (last && last.tone === tone && Math.abs(last.left + last.width - left) < 1e-9) last.width += width;
      else pieces.push({ left, width, tone });
    }
    const left = scalePos(a);
    return { kind: seg.kind, fromMin: a, toMin: b, left, width: scalePos(b) - left, pieces };
  });
}

export interface BarEnds {
  leave: { min: number; left: number; rideMin: number };
  /** Null when the way home is unknown (a train with none back). */
  home: { min: number; left: number; rideMin: number } | null;
}

/** The two ends of the bar: "odchod 7:05 / auto 55 min" and "doma 16:05 / auto 55 min". */
export function barEnds(plan: DayPlan): BarEnds {
  const first = plan.segments[0];
  const last = plan.segments[plan.segments.length - 1];
  const ride = (s: Segment) => Math.round((s.end.getTime() - s.start.getTime()) / MIN);
  const leaveMin = dayMinutes(first.start, plan.hikeStart);
  const hasThere = first.kind === "drive-there";
  const hasBack = last.kind === "drive-back";
  const homeMin = hasBack ? dayMinutes(last.end, plan.hikeStart) : null;
  return {
    leave: { min: leaveMin, left: scalePos(leaveMin), rideMin: hasThere ? ride(first) : 0 },
    home: homeMin === null ? null : { min: homeMin, left: scalePos(homeMin), rideMin: ride(last) },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Hour row

export type CellState = "plain" | "rain" | "storm" | "ring";

export interface RowCell {
  h: number;
  t: number;
  kind: SkyKind | null;
  dark: boolean;
  /** rain/storm: amber/red fill, hours of the hike with bad weather. ring: night hours under the hike get an amber ring, not a fill. */
  state: CellState;
}

/** The scale's hours as `hourStrip` cells (6:00 to 19:00 of the plan's day). */
export function rowRange(plan: DayPlan): { from: Date; to: Date } {
  const w = wallClock(plan.hikeStart);
  return { from: zonedDate(w.y, w.mo, w.d, SCALE_FROM_MIN / 60, 0), to: zonedDate(w.y, w.mo, w.d, SCALE_TO_MIN / 60 - 1, 30) };
}

/** What each hour cell of the row shows. Dark hours win over rain: a night hour of the hike is a ring. */
export function rowCells(plan: DayPlan, cells: HourCell[]): RowCell[] {
  const a = plan.hikeStart.getTime();
  const b = plan.hikeEnd.getTime();
  const bad = badHoursInSpan(cells, a, b);
  return cells.map((c, i) => {
    const mid = c.t + HOUR / 2;
    const dark = mid < plan.sunrise.getTime() || mid > plan.sunset.getTime();
    const underHike = c.t < b && c.t + HOUR > a;
    const state: CellState = underHike && dark ? "ring" : bad[i] === "danger" ? "storm" : bad[i] ? "rain" : "plain";
    return { h: wallClock(c.t).h, t: c.t, kind: c.kind, dark, state };
  });
}

/**
 * The row's background: night, a soft peach edge at sunrise and sunset, day. It carries meaning (where the
 * light ends), so it stays a gradient although the brief frowns on decorative ones. `edgeMin` is half the edge.
 */
export function dayBand(plan: DayPlan, edgeMin = 8): string {
  const night = "var(--sky-night)";
  const day = "var(--segment-bg)";
  const edge = "var(--sky-twilight)";
  const pct = (min: number) => `${Math.round(scalePos(min) * 10000) / 100}%`;
  const rise = dayMinutes(plan.sunrise, plan.hikeStart);
  const set = dayMinutes(plan.sunset, plan.hikeStart);
  const stops: string[] = [];
  const risesInside = rise > SCALE_FROM_MIN && rise < SCALE_TO_MIN;
  const setsInside = set > SCALE_FROM_MIN && set < SCALE_TO_MIN;
  const startsDark = rise >= SCALE_TO_MIN || set <= SCALE_FROM_MIN || rise > SCALE_FROM_MIN;
  stops.push(`${startsDark ? night : day} 0%`);
  if (risesInside) stops.push(`${night} ${pct(rise - edgeMin)}`, `${edge} ${pct(rise)}`, `${day} ${pct(rise + edgeMin)}`);
  if (setsInside) stops.push(`${day} ${pct(set - edgeMin)}`, `${edge} ${pct(set)}`, `${night} ${pct(set + edgeMin)}`);
  const endsDark = set < SCALE_TO_MIN || rise >= SCALE_TO_MIN;
  stops.push(`${endsDark ? night : day} 100%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export interface SunMark {
  kind: "rise" | "set";
  /** Minutes after midnight. */
  min: number;
  left: number;
}

/** Sunrise and sunset where they fall on the scale; one outside 6-20 (a June sunset) is left out. */
export function sunMarks(plan: DayPlan): SunMark[] {
  return (
    [
      { kind: "rise", min: dayMinutes(plan.sunrise, plan.hikeStart) },
      { kind: "set", min: dayMinutes(plan.sunset, plan.hikeStart) },
    ] as const
  )
    .filter((m) => m.min > SCALE_FROM_MIN && m.min < SCALE_TO_MIN)
    .map((m) => ({ ...m, left: scalePos(m.min) }));
}

// ---------------------------------------------------------------------------------------------------------
// Option cards

/** A start the cards can offer: a day and the walk start there. */
export interface KedyCandidate {
  date: string;
  /** Walk start, HH:MM. */
  start: string;
  /** The best dry day (the green "najlepšie" pill). */
  best?: boolean;
}

export type WetKind = "rain" | "snow" | "sleet";

export interface KedyCard {
  /** Day + start, unique among the cards. */
  key: string;
  date: string;
  /** Walk start, HH:MM, and the end of the walk and the way home, in the running-text form (8:00). */
  start: string;
  startText: string;
  endText: string;
  homeText: string | null;
  selected: boolean;
  sameDay: boolean;
  best: boolean;
  /** Rain, snow or sleet in the walk: "when" is the span ("8:00–10:00"), atStart when it begins with the walk. */
  wet: { kind: WetKind; when: string; atStart: boolean } | null;
  /** A storm or heavy rain: shown red. */
  storm: boolean;
  /** The forecast covers the walk (else no "sucho"). */
  known: boolean;
  /** The walk ends after sunset. */
  afterSunset: boolean;
  /** Up to four skies along the walk, for the small icon row. */
  skies: { kind: SkyKind; night: boolean }[];
  tempMin: number | null;
  tempMax: number | null;
  /** The card came from the "better time"/"better day" search, not from a choice made earlier. */
  suggested: boolean;
}

export interface KedyForecast {
  below: WeatherForecast | null;
  above: WeatherForecast | null;
}

export interface KedyCardInput {
  plan: DayPlan;
  forecast: KedyForecast;
  /** Earlier choices to keep offering (the card you just left is one). */
  kept: KedyCandidate[];
  now: Date;
  /** Sunrise and sunset of another day (the trailhead's); null where unknown. */
  sunFor: (iso: string) => { sunrise: Date; sunset: Date } | null;
  /** A walk moved to another day still works there (no closure, daylight, ...). */
  fits: (from: Date, to: Date) => boolean;
}

/** The wet part of a walk, in the words of its first and last hour. */
function parseShort(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

const keyOf = (date: string, start: string) => `${date}|${start}`;

/** The walk window of a candidate: same walk length, same ride either side as the plan (an estimate for another day). */
export function windowFor(plan: DayPlan, date: string, start: string): { start: Date; end: Date; home: Date | null } {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = start.split(":").map(Number);
  const a = zonedDate(y, mo, d, h, mi);
  const last = plan.segments[plan.segments.length - 1];
  const back = last.kind === "drive-back" ? last.end.getTime() - plan.hikeEnd.getTime() : null;
  const end = new Date(a.getTime() + (plan.hikeEnd.getTime() - plan.hikeStart.getTime()));
  return { start: a, end, home: back === null ? null : new Date(end.getTime() + back) };
}

/** Everything a card says about one candidate. */
export function describeCandidate(input: KedyCardInput, c: KedyCandidate, selected: boolean, suggested = false): KedyCard {
  const { plan, forecast } = input;
  const date = clockDate(plan.hikeStart);
  const w = windowFor(plan, c.date, c.start);
  const sun = c.date === date ? { sunrise: plan.sunrise, sunset: plan.sunset } : input.sunFor(c.date);
  const report = forecast.below ? tripWeatherReport(forecast.below, forecast.above, w.start, w.end, { from: w.start, to: w.end }) : null;
  const storm = !!forecast.below && !!report && weatherNotes(forecast.below, forecast.above, w.start, w.end).some((n) => n.strong);
  const wet = report?.wet
    ? {
        kind: (report.wet.snow ? "snow" : report.wet.sleet ? "sleet" : "rain") as WetKind,
        when: report.wet.when,
        atStart: parseShort(report.wet.when.split("–")[0]) - dayMinutes(w.start, w.start) <= 30,
      }
    : null;
  const skies: KedyCard["skies"] = [];
  if (forecast.below) {
    const len = w.end.getTime() - w.start.getTime();
    for (let i = 0; i < 4; i++) {
      const at = new Date(w.start.getTime() + Math.min(len - MIN, (len * i) / 3));
      const kind = skyKind(weatherAt(forecast.below, at.getTime())?.symbol ?? null);
      if (kind) skies.push({ kind, night: !!sun && (at < sun.sunrise || at > sun.sunset) });
    }
  }
  const sum = forecast.below ? summarize(forecast.below, w.start, w.end) : null;
  return {
    key: keyOf(c.date, c.start),
    date: c.date,
    start: c.start,
    startText: clockShort(w.start),
    endText: clockShort(w.end),
    homeText: w.home ? clockShort(w.home) : null,
    selected,
    sameDay: c.date === date,
    best: !!c.best,
    wet,
    storm,
    known: !!report,
    afterSunset: !!sun && w.end > sun.sunset,
    skies,
    tempMin: sum?.tempMin ?? null,
    tempMax: sum?.tempMax ?? null,
    suggested,
  };
}

/** The ISO date (Slovak calendar) of an instant. */
function clockDate(at: Date): string {
  const w = wallClock(at);
  return `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

/** The day `offset` days from `iso`, for the better-day card. */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * The selected card (the current choice) first, then up to two others: a drier time the same day (nearest
 * first, one that stays in daylight before one that ends in the dark: Peter's mockup shows the dark one with
 * its consequence), a drier day, then the choices made before. When you pick a card the one you leave stays on the
 * list, so the choice can be undone with a tap.
 */
export function kedyCards(input: KedyCardInput): KedyCard[] {
  const { plan, forecast, now } = input;
  const date = clockDate(plan.hikeStart);
  const here: KedyCandidate = { date, start: clock(plan.hikeStart) };
  const current = describeCandidate(input, here, true);
  const found: { c: KedyCandidate; suggested: boolean }[] = [];

  if (forecast.below) {
    const lead = leadMs(plan);
    const earliest = new Date(Math.max(plan.sunrise.getTime(), now.getTime() + lead));
    const inLight = betterTime(forecast.below, forecast.above, plan.hikeStart, plan.hikeEnd, {
      earliest,
      latest: new Date(plan.sunset.getTime() - SAFE_MARGIN_MIN * MIN),
    });
    const sooner =
      inLight ??
      betterTime(forecast.below, forecast.above, plan.hikeStart, plan.hikeEnd, { earliest, latest: new Date(plan.sunset.getTime() + 2 * HOUR) });
    if (sooner) {
      // To 5 minutes (a start of 10:13 is odd to ask for): later times round up, earlier ones down, so the walk stays on the dry side.
      const step = 5 * MIN;
      const raw = plan.hikeStart.getTime() + sooner.shiftMin * MIN;
      const snapped = sooner.shiftMin > 0 ? Math.ceil(raw / step) * step : Math.floor(raw / step) * step;
      const len = plan.hikeEnd.getTime() - plan.hikeStart.getTime();
      const a = new Date(snapped);
      const start = wetWalk(forecast.below, forecast.above, a, new Date(snapped + len)) ? raw : snapped;
      found.push({ c: { date, start: clock(new Date(start)) }, suggested: true });
    }
    const better = betterDay(forecast.below, forecast.above, plan.hikeStart, plan.hikeEnd, now, { leadMin: lead / MIN, fits: input.fits });
    if (better && better.offset < FORECAST_DAYS) found.push({ c: { date: addDays(date, better.offset), start: here.start, best: true }, suggested: true });
  }
  for (const k of input.kept) found.push({ c: k, suggested: false });

  const seen = new Set([current.key]);
  const others: KedyCard[] = [];
  for (const { c, suggested } of found) {
    if (others.length >= 2) break;
    const k = keyOf(c.date, c.start);
    if (seen.has(k)) continue;
    seen.add(k);
    others.push(describeCandidate(input, c, false, suggested));
  }
  return [current, ...others];
}

export function toCandidate(c: KedyCard): KedyCandidate {
  return { date: c.date, start: c.start, ...(c.best ? { best: true } : {}) };
}

/** After picking `picked`: the cards that were on the list, the one left behind first, kept for next time (three at most). */
export function keptAfterPick(cards: KedyCard[], picked: KedyCard): KedyCandidate[] {
  const out: KedyCandidate[] = [];
  const left = cards.find((c) => c.selected);
  for (const c of [left, ...cards.filter((x) => !x.selected && x.key !== picked.key)]) {
    if (c && !out.some((o) => keyOf(o.date, o.start) === c.key)) out.push(toCandidate({ ...c, best: c.best && !c.selected }));
  }
  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------------------------------------
// Warnings (each its own item, Peter 2026-11-12: never merge rain, frost and after-dark in one box)

export type WarnFix =
  | { kind: "time"; start: string; way: "dry" | "until" | "after" }
  | { kind: "day"; date: string; start: string };

export interface KedyWarning {
  key: string;
  tone: "warn" | "danger";
  text: string;
  /** The way out as one tap; null when there is none to offer. */
  fix: WarnFix | null;
}

/** The first card that is a dry fix for a wet walk: a drier time, or else a drier day. */
export function dryFix(cards: KedyCard[]): WarnFix | null {
  const dry = (c: KedyCard) => !c.selected && c.known && !c.wet && !c.storm;
  const time = cards.find((c) => dry(c) && c.sameDay && c.suggested);
  if (time) return { kind: "time", start: time.start, way: "dry" };
  const day = cards.find((c) => dry(c) && !c.sameDay && c.suggested);
  return day ? { kind: "day", date: day.date, start: day.start } : null;
}

/** Minutes from `a` to `b` on the clock, for "Začnite do" (the limit is earlier than the current start). */
export function isEarlier(hhmmA: string, hhmmB: string): boolean {
  return hhmmToMin(hhmmA) < hhmmToMin(hhmmB);
}

// ---------------------------------------------------------------------------------------------------------
// Folded header

export interface SummaryParts {
  start: string;
  end: string;
  /** The way home's end ("doma 16:05"); null when unknown. */
  home: string | null;
}

/** "túra 8:00–15:10 · doma 16:05": the walk start and end and the clock time at home. */
export function summaryParts(plan: DayPlan): SummaryParts {
  const last = plan.segments[plan.segments.length - 1];
  return { start: clockShort(plan.hikeStart), end: clockShort(plan.hikeEnd), home: last.kind === "drive-back" ? clockShort(last.end) : null };
}

/** A short word for the way: the labels over the bar's ends and the home word ("auto", "autobus", "vlak", "pešo"). */
export type Way = "car" | "bus" | "train" | "foot";
