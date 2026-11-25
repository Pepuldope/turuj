"use client";

import { useCallback } from "react";
import type { SavedTrip } from "@/lib/savedTrips";
import { useTripSettings } from "@/lib/tripSettings";
import { setTripStops } from "@/lib/tripStops";
import { useUserLocation } from "@/lib/userLocation";

/**
 * Puts a saved plan back in place: its day, departure time, way of travel, kids, start and stops, so the
 * trip page shows the day as it was planned. The same as "Otvoriť" in Moje výlety (SavedTripsList.open).
 */
export function usePutPlanBack(): (trip: SavedTrip) => void {
  const { update } = useTripSettings();
  const { setManualStart } = useUserLocation();
  return useCallback(
    (trip: SavedTrip) => {
      update({ date: trip.date, time: trip.time, ...(trip.travel ? { travel: trip.travel } : {}), ...(trip.withKids !== undefined ? { withKids: trip.withKids } : {}) });
      if (trip.start) setManualStart(trip.start, "remembered");
      setTripStops(trip.slug, trip.stops ?? []);
    },
    [update, setManualStart]
  );
}
