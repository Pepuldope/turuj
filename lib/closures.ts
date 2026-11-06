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

/** "1. 11. do 31. 5." for a yearly closure; with the year for a one-off one. */
export function closurePeriod(c: Closure): string {
  const short = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return c.kind === "jednorazova" ? `${d}. ${m}. ${y}` : `${d}. ${m}.`;
  };
  return `${short(c.starts_on)} do ${short(c.ends_on)}`;
}

/** Who keeps the closure, from the rule id ("tanap-…" -> TANAP). Unknown prefix: the official source. */
export function closureManager(c: Closure): string {
  if (c.id.startsWith("tanap-")) return "TANAP";
  if (c.id.startsWith("malafatra-")) return "NP Malá Fatra";
  return "správca územia";
}
