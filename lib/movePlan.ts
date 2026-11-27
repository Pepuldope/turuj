import { planKey } from "@/lib/savedTrips";
import { track } from "@/lib/analytics";
import { planDay } from "@/lib/dayPlan";
import { eveJobFor, eveWanted } from "@/lib/eve";
import type { Lang } from "@/lib/lang";
import type { SavedTrip } from "@/lib/savedTrips";
import { post, subscribe, support } from "@/components/TrailReminders";

type Patch = (key: string, change: Partial<SavedTrip>) => void;
/** Where the answer was given: the home strip, the trip page's row, or the card in Moje výlety. */
export type AnswerFrom = "home" | "ask" | "list";

/** The plan as the saved snapshot alone draws it (the same input the card in Moje výlety uses). */
export function savedDayPlan(trip: SavedTrip) {
  const transit = trip.transit ?? false;
  return planDay({
    date: trip.date,
    start: trip.time,
    driveMin: trip.driveMin,
    hikeMin: trip.hikeMin,
    location: trip.sun,
    travelMode: transit ? "transit" : "auto",
    approx: transit && !trip.fixed,
    fixed: trip.fixed ?? null,
  });
}

/**
 * "Iný deň" on a plan whose day has passed (C229, Peter 26 Nov 2026): the same plan on the new day, at the same
 * time. Real train times belong to the old day, so a plan by train becomes an approximate one until the trip page
 * is opened and saved again. The plan is asked about again after its new day. A plan whose evening reminder was on
 * gets it for the new day, when that evening is still ahead.
 */
export function movePlan(trip: SavedTrip, date: string, patch: Patch, lang: Lang, from: AnswerFrom) {
  const moved: SavedTrip = { ...trip, date, skipAsk: false, ...(trip.fixed ? { fixed: null } : {}) };
  patch(planKey(trip), { date, skipAsk: false, ...(trip.fixed ? { fixed: null } : {}) });
  track("plan_moved", { from });
  if (trip.eve === true) void replantEve(moved, lang);
}

async function replantEve(trip: SavedTrip, lang: Lang) {
  try {
    if (support() !== "ok" || Notification.permission !== "granted" || eveWanted(trip.date) === null) return;
    const plan = savedDayPlan(trip);
    const job = plan ? eveJobFor(trip, plan, trip.sun, lang, trip.closures ?? []) : null;
    if (!job) return;
    const sub = await subscribe();
    await post({ action: "eve", sub: sub.toJSON(), slug: planKey(trip), name: trip.name, lang, date: trip.date, job });
  } catch {
    // No push here: the trip page sends it again when the plan is opened.
  }
}

/** "Zrušiť" on a plan whose day has passed: the plan goes; a visit is never touched. */
export function cancelPlan(trip: SavedTrip, remove: (key: string) => void | Promise<void>, from: AnswerFrom) {
  void remove(planKey(trip));
  track("plan_cancelled", { from });
}
