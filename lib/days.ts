/**
 * Days and daylight for the home list: the day chips, Slovak day names, and
 * "does this trip fit that day's daylight?" Pure, so it is unit tested.
 */
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import { getSunTimes } from "@/lib/sun";
import type { LatLng } from "@/lib/types";
import { wallClock, zonedDate } from "@/lib/zoned";
import type { Lang } from "@/lib/lang";

const MIN = 60000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** The Slovak calendar date of an instant, YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const w = wallClock(d);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
}

/** A calendar date as UTC midnight: only for its weekday and day numbers (getUTC*), never a clock time. */
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function calendarIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The calendar date `n` days after `iso`. */
export function addDaysIso(iso: string, n: number): string {
  const d = parseIso(iso);
  return calendarIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n)));
}

/** Whole calendar days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000);
}

const WEEKDAY = ["nedeľa", "pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota"];
/** "v sobotu", "vo štvrtok": the form used in sentences. */
const WEEKDAY_IN = ["v nedeľu", "v pondelok", "v utorok", "v stredu", "vo štvrtok", "v piatok", "v sobotu"];
const WEEKDAY_SHORT = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
const EN_WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (lang: Lang, day: number) => (lang === "en" ? EN_WEEKDAY[day].slice(0, 3) : WEEKDAY_SHORT[day]);

export interface DayChip {
  iso: string;
  label: string;
}

/** Dnes, Zajtra, then the coming Saturday and Sunday unless they are already on the list. */
export function dayChips(now: Date, lang: Lang = "sk"): DayChip[] {
  const today = isoDate(now);
  const chips: DayChip[] = [
    { iso: today, label: lang === "en" ? "Today" : "Dnes" },
    { iso: addDaysIso(today, 1), label: lang === "en" ? "Tomorrow" : "Zajtra" },
  ];
  for (const weekday of [6, 0]) {
    const ahead = (weekday - parseIso(today).getUTCDay() + 7) % 7;
    const iso = addDaysIso(today, ahead);
    if (!chips.some((c) => c.iso === iso)) chips.push({ iso, label: short(lang, weekday) });
  }
  return chips;
}

export interface StripDay {
  iso: string;
  /** "So" */
  weekday: string;
  /** Day of the month. */
  day: number;
  weekend: boolean;
}

/** The days after tomorrow, for the "iný deň" strip (Dnes and Zajtra have their own buttons). */
export function dayStrip(now: Date, count = 14, lang: Lang = "sk"): StripDay[] {
  const today = isoDate(now);
  return Array.from({ length: count }, (_, i) => {
    const iso = addDaysIso(today, i + 2);
    const d = parseIso(iso);
    return { iso, weekday: short(lang, d.getUTCDay()), day: d.getUTCDate(), weekend: d.getUTCDay() % 6 === 0 };
  });
}

/** "So 17. 10." */
export function shortDay(iso: string, lang: Lang = "sk"): string {
  return `${short(lang, parseIso(iso).getUTCDay())} ${shortDate(iso, lang)}`;
}

/** "17. 10." */
export function shortDate(iso: string, lang: Lang = "sk"): string {
  const d = parseIso(iso);
  if (lang === "en") return `${d.getUTCDate()} ${EN_MONTH[d.getUTCMonth()]}`;
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

/** "sobota": the weekday alone. */
export function weekdayName(iso: string, lang: Lang = "sk"): string {
  const day = parseIso(iso).getUTCDay();
  return lang === "en" ? EN_WEEKDAY[day] : WEEKDAY[day];
}

/** "v sobotu", "on Saturday": the weekday as it stands in a sentence. */
export function weekdayInSentence(iso: string, lang: Lang = "sk"): string {
  const day = parseIso(iso).getUTCDay();
  return lang === "en" ? `on ${EN_WEEKDAY[day]}` : WEEKDAY_IN[day];
}

/** "sobota 17. 10." */
export function longDay(iso: string, lang: Lang = "sk"): string {
  if (lang === "en") return `${EN_WEEKDAY[parseIso(iso).getUTCDay()]} ${shortDate(iso, lang)}`;
  return `${WEEKDAY[parseIso(iso).getUTCDay()]} ${shortDate(iso)}`;
}

/** After "na": "nedeľu 18. 10." ("Uložené na nedeľu 18. 10."). */
export function dayAfterNa(iso: string, lang: Lang = "sk"): string {
  if (lang === "en") return longDay(iso, lang);
  return `${WEEKDAY_IN[parseIso(iso).getUTCDay()].replace(/^vo? /, "")} ${shortDate(iso)}`;
}

/** For sentences: "dnes", "zajtra", "v sobotu", or "v pondelok 19. 10." further out. */
export function dayInSentence(iso: string, now: Date, lang: Lang = "sk"): string {
  const today = isoDate(now);
  if (iso === today) return lang === "en" ? "today" : "dnes";
  if (iso === addDaysIso(today, 1)) return lang === "en" ? "tomorrow" : "zajtra";
  const day = parseIso(iso).getUTCDay();
  const weekday = lang === "en" ? `on ${EN_WEEKDAY[day]}` : WEEKDAY_IN[day];
  const days = daysBetween(today, iso);
  return days > 0 && days < 7 ? weekday : `${weekday} ${shortDate(iso, lang)}`;
}

/** Departure times are shown rounded down to 5 min: "14:55", never a later "14:58". */
export function floorTo5(d: Date): Date {
  const step = 5 * MIN;
  return new Date(Math.floor(d.getTime() / step) * step);
}

export type FitStatus =
  /** Fits: you can still leave at or before `latest`. */
  | "fits"
  /** Today only: the latest departure has already passed. */
  | "too-late"
  /** Doesn't fit this day's daylight even leaving at sunrise. */
  | "too-long"
  /** Fits on paper, but only by leaving before EARLIEST_DEPARTURE_HOUR. */
  | "too-early";

/** Nobody leaves for a day trip at 3 a.m.: earlier latest departures don't count as fitting. */
export const EARLIEST_DEPARTURE_HOUR = 5;

export interface DayFit {
  status: FitStatus;
  /** Latest departure (hike start when the drive is unknown) that ends the hike SAFE_MARGIN_MIN before sunset. */
  latest: Date;
  sunset: Date;
}

export interface DayFitInput {
  /** YYYY-MM-DD */
  date: string;
  now: Date;
  /** One-way drive in minutes; null when unknown. */
  driveMin: number | null;
  hikeMin: number;
  location: LatLng;
}

/**
 * Does the trip fit the day's daylight? Today is strict (the latest departure
 * must still be ahead of us); other days only need the hike to fit between
 * sunrise and SAFE_MARGIN_MIN before sunset, because people plan ahead and can
 * leave early.
 */
export function dayFit({ date, now, driveMin, hikeMin, location }: DayFitInput): DayFit | null {
  const day = parseIso(date);
  if (Number.isNaN(day.getTime())) return null;
  const sun = getSunTimes(day, location.lat, location.lon);
  if (!sun) return null;
  const drive = driveMin ?? 0;
  const latest = floorTo5(new Date(sun.sunset.getTime() - (SAFE_MARGIN_MIN + hikeMin + drive) * MIN));
  const earliest = new Date(sun.sunrise.getTime() - drive * MIN);

  let status: FitStatus = "fits";
  if (latest < earliest) status = "too-long";
  else if (latest < zonedDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), EARLIEST_DEPARTURE_HOUR)) status = "too-early";
  else if (date === isoDate(now) && latest < now) status = "too-late";
  return { status, latest, sunset: sun.sunset };
}

/** "pol dňa": the whole outing (there, hike, back) fits in this many minutes. */
export const HALF_DAY_MIN = 5 * 60;
