import { daysBetween } from "@/lib/days";
import { formatDateSk } from "@/lib/format";
import type { Lang } from "@/lib/lang";

// When a visit was, as the visitor knows it (Peter, 25 Nov 2026): a full day, a year with a season, only a
// year, or not at all. The stored forms are the ones account sync accepts (VISIT_DATE in lib/syncMerge.ts):
// "2026-11-21", "2025-su", "2025", "".

export type Season = "sp" | "su" | "au" | "wi";
export const SEASONS: readonly Season[] = ["sp", "su", "au", "wi"];

const SEASON_SK: Record<Season, string> = { sp: "jar", su: "leto", au: "jeseň", wi: "zima" };
const SEASON_EN: Record<Season, string> = { sp: "spring", su: "summer", au: "autumn", wi: "winter" };

export const seasonWord = (season: Season, lang: Lang = "sk"): string => (lang === "en" ? SEASON_EN : SEASON_SK)[season];

export type When = { kind: "day"; iso: string } | { kind: "season"; year: number; season: Season } | { kind: "year"; year: number } | { kind: "unknown" };

export function parseWhen(date: string): When {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: "day", iso: date };
  const season = /^(\d{4})-(sp|su|au|wi)$/.exec(date);
  if (season) return { kind: "season", year: Number(season[1]), season: season[2] as Season };
  if (/^\d{4}$/.test(date)) return { kind: "year", year: Number(date) };
  return { kind: "unknown" };
}

/** The stored form of "about then": a year, with the season when the visitor knows it. */
export const roughWhen = (year: number, season: Season | null): string => (season ? `${year}-${season}` : String(year));

/** "21. 11. 2026", "leto 2025", "2025", or "neviem presne" when the visitor does not know. */
export function whenLabel(date: string, lang: Lang = "sk"): string {
  const when = parseWhen(date);
  if (when.kind === "day") return formatDateSk(when.iso, lang);
  if (when.kind === "season") return `${seasonWord(when.season, lang)} ${when.year}`;
  if (when.kind === "year") return String(when.year);
  return lang === "en" ? "date not known" : "neviem presne";
}

// The middle of each season; winter counts to the year the visitor names, so it sits in January.
const SEASON_MID: Record<Season, string> = { wi: "01-15", sp: "04-15", su: "07-15", au: "10-15" };

/** Puts visits in order of time: a later visit has a greater key; a visit with no date comes before all. */
export function whenKey(date: string): string {
  const when = parseWhen(date);
  if (when.kind === "day") return when.iso;
  if (when.kind === "season") return `${when.year}-${SEASON_MID[when.season]}`;
  if (when.kind === "year") return `${when.year}-07-01`;
  return "";
}

/** The year a visit counts to, or null when not known. */
export function whenYear(date: string): number | null {
  const when = parseWhen(date);
  return when.kind === "day" ? Number(when.iso.slice(0, 4)) : when.kind === "unknown" ? null : when.year;
}

/** For this many days after a visit the review also asks about the trail and the day; later only the stars (Peter, 25 Nov 2026). */
export const DETAIL_DAYS = 30;

/** Whether the review of a visit asks its detail questions: only for a known day that is recent. */
export function detailAsked(date: string, today: string): boolean {
  const when = parseWhen(date);
  if (when.kind !== "day") return false;
  const days = daysBetween(when.iso, today);
  return days >= 0 && days <= DETAIL_DAYS;
}

/** The years offered as buttons under "Neviem presný deň": this year and the three before. */
export const yearChoices = (today: string, count = 4): number[] => Array.from({ length: count }, (_, i) => Number(today.slice(0, 4)) - i);
