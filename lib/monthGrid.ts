// The month view of the visit window's own calendar (Peter, 26 Nov 2026: the browser's date picker "is not
// working"; it differs by browser and phone, so the window draws the month itself). Pure.
import type { Lang } from "@/lib/lang";

export interface Month { year: number; month: number }

const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS_SK = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_SK = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const DAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** The month of a calendar date "YYYY-MM-DD". */
export const monthOf = (iso: string): Month => ({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });

/** `by` months later (earlier when negative). */
export function shiftMonth({ year, month }: Month, by: number): Month {
  const n = year * 12 + (month - 1) + by;
  return { year: Math.floor(n / 12), month: (((n % 12) + 12) % 12) + 1 };
}

/** Before, the same or after: negative, 0 or positive. */
export const compareMonths = (a: Month, b: Month): number => a.year * 12 + a.month - (b.year * 12 + b.month);

/** "november 2026" */
export const monthTitle = ({ year, month }: Month, lang: Lang = "sk"): string => `${(lang === "en" ? MONTHS_EN : MONTHS_SK)[month - 1]} ${year}`;

/** The column heads, Monday first. */
export const weekdayHeads = (lang: Lang = "sk"): readonly string[] => (lang === "en" ? DAYS_EN : DAYS_SK);

/** The month's weeks, Monday first: each day as "YYYY-MM-DD", null where the cell belongs to another month. */
export function monthGrid({ year, month }: Month): (string | null)[][] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // Monday = 0 ... Sunday = 6.
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
