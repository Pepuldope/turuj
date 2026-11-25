import { addDaysIso, longDay, shortDate } from "@/lib/days";
import type { Lang } from "@/lib/lang";
import type { SavedTrip } from "@/lib/savedTrips";

/** The id of the plan card on the trip page (TripPlanner): where "Otvoriť" in the plan row moves to. */
export const PLAN_CARD_ID = "vas-plan";

type Plan = Pick<SavedTrip, "date" | "time" | "savedAt" | "doneAt">;

/**
 * Still ahead: planned for today or a later day and not marked as done. The whole trip day counts, also after
 * the departure time: the group is on the trail then and may want its plan. From the next day the trip page
 * asks "Boli ste na výlete?" instead.
 */
export const stillPlanned = (trip: Pick<SavedTrip, "date" | "doneAt">, today: string): boolean => !trip.doneAt && trip.date >= today;

/** The plan the home page shows: the nearest day, then the earlier departure, then the one saved last. */
export function nextPlan<T extends Plan>(trips: readonly T[], today: string): T | null {
  const ahead = trips.filter((t) => stillPlanned(t, today));
  if (ahead.length === 0) return null;
  return ahead.reduce((best, t) => (order(t, best) < 0 ? t : best));
}

function order(a: Plan, b: Plan): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.savedAt > b.savedAt ? -1 : a.savedAt < b.savedAt ? 1 : 0;
}

/**
 * A plan's day in two parts, the word and the date, so the date can be set as a number:
 * "dnes" + "25. 11.", "zajtra" + "26. 11.", else "sobota" + "28. 11.".
 */
export function planDay(iso: string, today: string, lang: Lang = "sk"): { word: string; date: string } {
  const date = shortDate(iso, lang);
  if (iso === today) return { word: lang === "en" ? "today" : "dnes", date };
  if (iso === addDaysIso(today, 1)) return { word: lang === "en" ? "tomorrow" : "zajtra", date };
  // longDay is "sobota 28. 11.": the weekday is what stands before the date.
  return { word: longDay(iso, lang).slice(0, -date.length).trim(), date };
}
