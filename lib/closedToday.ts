/**
 * Is a trip's yearly closure ("1. 11. - 31. 5.") in force today? The trip pages are built once, so
 * their HTML carries only the rule (as "MM-DD" start and end); the browser checks it against today's
 * Slovak date (components/NearbyList.tsx). Same month/day comparison as isClosureActive, including a
 * range that wraps the new year.
 */
import { wallClock } from "@/lib/zoned";

/** "MM-DD" of an ISO date ("2026-11-01" -> "11-01"). */
export const monthDayOf = (iso: string) => iso.slice(5, 10);

/** Today's Slovak calendar date as "MM-DD", whatever the device's timezone. */
export function todayMonthDay(now: Date = new Date()): string {
  const { mo, d } = wallClock(now);
  return `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** True when `today` ("MM-DD") is on or between `from` and `to` ("MM-DD", both days count), year ignored. */
export function inYearlyRange(from: string, to: string, today: string): boolean {
  return from <= to ? today >= from && today <= to : today >= from || today <= to;
}

/** "31. 5." from "05-31", with a no-break space like the closure chips. */
export function dayMonthOf(md: string): string {
  return `${Number(md.slice(3, 5))}. ${Number(md.slice(0, 2))}.`;
}

/** Slovak plural class of a count: 1, 2-4 and 5 or more. */
export function pluralClass(n: number): "one" | "few" | "many" {
  return n === 1 ? "one" : n >= 2 && n <= 4 ? "few" : "many";
}
