"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { useLang } from "@/lib/i18n";
import { langPath } from "@/lib/lang";
import { smoothScroll } from "@/lib/motion";
import { PLAN_CARD_ID } from "@/lib/nextPlan";
import type { SavedTrip } from "@/lib/savedTrips";
import type { LastWalk } from "@/lib/visitedList";
import { useTripSettings } from "@/lib/tripSettings";
import { setTripStops } from "@/lib/tripStops";
import { routeTrip } from "@/lib/visits";
import { useUserLocation } from "@/lib/userLocation";

/**
 * Puts a saved plan back in place: its day, departure time, way of travel, kids, start and stops, so the
 * trip page shows the day as it was planned. The same as "Otvoriť" in Moje výlety (SavedTripsList.open).
 */
export function usePutPlanBack(): (trip: SavedTrip) => void {
  const { openPlan } = useTripSettings();
  const { setManualStart } = useUserLocation();
  return useCallback(
    (trip: SavedTrip) => {
      // openPlan, not update: the day the home list showed comes back when the visitor returns to it.
      openPlan({ date: trip.date, time: trip.time, ...(trip.travel ? { travel: trip.travel } : {}), ...(trip.withKids !== undefined ? { withKids: trip.withKids } : {}) });
      if (trip.start) setManualStart(trip.start, "remembered");
      setTripStops(trip.slug, trip.stops ?? []);
    },
    [openPlan, setManualStart]
  );
}

/**
 * "Naplánovať znova" on a visited place (Peter, 26 Nov 2026: "easily copy paste it and go on it again"): opens
 * the route walked last time at its plan card. When that visit came from a saved plan that is still on the
 * device, the plan's departure time, way of travel, kids, start and stops are put back; never its day, which
 * has passed. Everything can be changed on the page before the new plan is saved.
 */
export function usePlanAgain(): (walk: LastWalk) => void {
  const { update } = useTripSettings();
  const { setManualStart } = useUserLocation();
  const router = useRouter();
  const lang = useLang();
  return useCallback(
    ({ route, plan, how }: LastWalk) => {
      if (plan) {
        update({ time: plan.time, ...(plan.travel ? { travel: plan.travel } : {}), ...(plan.withKids !== undefined ? { withKids: plan.withKids } : {}) });
        if (plan.start) setManualStart(plan.start, "remembered");
        setTripStops(plan.slug, plan.stops ?? []);
      } else if (how) {
        // Never a day and never a time. Stops are kept under the trip page's slug, which for a loop is not the route.
        update({ ...(how.travel ? { travel: how.travel } : {}), ...(how.withKids !== undefined ? { withKids: how.withKids } : {}) });
        if (how.start) setManualStart(how.start, "remembered");
        setTripStops(routeTrip(route), how.stops ?? []);
      }
      track("plan_open", { from: "again" });
      const href = langPath(lang, `/trasa/${route}`);
      // Already on that route's page: only the way down to the plan is left.
      if (window.location.pathname === href) document.getElementById(PLAN_CARD_ID)?.scrollIntoView({ block: "start", behavior: smoothScroll() });
      else if (navigator.onLine) router.push(`${href}#${PLAN_CARD_ID}`);
      // Without signal a full page load lets the service worker serve the saved copy.
      else window.location.assign(langPath(lang, `/trasa/${route}#${PLAN_CARD_ID}`));
    },
    [update, setManualStart, router, lang]
  );
}
