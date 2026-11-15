import { MONTH_SHORT_EN, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import type { Closure } from "@/lib/types";

interface MonthDay {
  month: number; // 1-12
  day: number;
}

function parseDate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function monthDay(iso: string): MonthDay {
  const { m, d } = parseDate(iso);
  return { month: m, day: d };
}

function monthDayValue({ month, day }: MonthDay): number {
  return month * 100 + day;
}

/**
 * True if `today` (an ISO YYYY-MM-DD date) falls within the closure's range.
 *
 * - `jednorazova`: plain calendar-date range comparison, year included.
 * - `rocna`: recurring annual range compared by month/day only, ignoring
 *   year. Handles ranges that wrap the new year (e.g. TANAP 1 Nov - 31 May).
 */
export function isClosureActive(closure: Closure, today: string): boolean {
  if (closure.kind === "jednorazova") {
    return today >= closure.starts_on && today <= closure.ends_on;
  }

  // rocna
  const start = monthDayValue(monthDay(closure.starts_on));
  const end = monthDayValue(monthDay(closure.ends_on));
  const now = monthDayValue(monthDay(today));

  if (start <= end) {
    // Normal range within one calendar year, e.g. 1 Apr - 30 Apr.
    return now >= start && now <= end;
  }
  // Wraps the new year, e.g. 1 Nov - 31 May.
  return now >= start || now <= end;
}

/** Returns the active closures for `today` (ISO YYYY-MM-DD), if any. */
export function activeClosures(closures: Closure[], today: string): Closure[] {
  return closures.filter((c) => isClosureActive(c, today));
}

/** "1. 11. do 31. 5." for a yearly closure (English "1 Nov to 31 May"); with the year for a one-off one. */
export function closurePeriod(c: Closure, lang: Lang = "sk"): string {
  const short = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    if (lang === "en") return c.kind === "jednorazova" ? `${d} ${MONTH_SHORT_EN[m - 1]} ${y}` : `${d} ${MONTH_SHORT_EN[m - 1]}`;
    return c.kind === "jednorazova" ? `${d}. ${m}. ${y}` : `${d}. ${m}.`;
  };
  return `${short(c.starts_on)} ${lang === "en" ? "to" : "do"} ${short(c.ends_on)}`;
}

/** "1. 11.–31. 5." as a short span; English "1 Nov–31 May". */
export function closureSpan(c: Closure, lang: Lang = "sk"): string {
  return closurePeriod(c, lang).replace(lang === "en" ? " to " : " do ", "–");
}

/** A yearly "D. M." date from the rules ("2026-11-01" or "11-01") written for the page's language. */
export function seasonDateIn(lang: Lang, iso: string): string {
  const parts = iso.split("-").map(Number);
  const [m, d] = parts.slice(-2);
  return lang === "en" ? `${d} ${MONTH_SHORT_EN[m - 1]}` : `${d}.\u00a0${m}.`;
}

/** Who keeps the closure, from the rule id ("tanap-…" -> TANAP). Unknown prefix: the official source. */
export function closureManager(c: Closure, lang: Lang = "sk"): string {
  if (c.id.startsWith("tanap-")) return "TANAP";
  if (c.id.startsWith("malafatra-")) return "NP Malá Fatra";
  return tr(lang, "správca územia");
}
