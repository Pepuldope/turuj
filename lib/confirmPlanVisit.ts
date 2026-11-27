import { planKey } from "@/lib/savedTrips";
import { track } from "@/lib/analytics";
import type { SavedTrip } from "@/lib/savedTrips";
import { markVisited } from "@/lib/visits";

/** "Áno, boli sme" on a saved plan: the plan is done and its trip becomes a visit, on the day the group confirmed. */
export function confirmPlanVisit(plan: SavedTrip, date: string, patch: (key: string, change: Partial<SavedTrip>) => void, how: "ask" | "home" | "list") {
  patch(planKey(plan), { doneAt: new Date().toISOString() });
  markVisited(plan, date);
  track("trip_done", { trail: plan.slug, how });
}
