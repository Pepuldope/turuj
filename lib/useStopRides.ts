"use client";

import { useEffect, useMemo, useState } from "react";
import { estimateDriveMin, transitMinutes } from "@/lib/drive";
import { dayIndex, journeys, loadRailTimetable, stationsNear } from "@/lib/rail";
import type { RailTimetable } from "@/lib/rail";
import type { StopRide } from "@/lib/stopPick";
import { useTripDay } from "@/lib/tripSettings";
import { HOME_STATION_M, TRAIL_STATION_M, stationAccessMin } from "@/lib/useRailTrip";
import { useDriveRoute } from "@/lib/useDriveRoute";
import { useUserLocation } from "@/lib/userLocation";
import type { LatLng, TransitStop } from "@/lib/types";

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * The first train from the start to the station by this stop, door to station, minutes: the way to the home station plus
 * the train (the same span the plan calls the ride). Null when no train makes it that day.
 */
export function trainRideMin(tt: RailTimetable, day: number, start: LatLng, stop: LatLng, time: string): number | null {
  if (day < 0) return null;
  const origins = stationsNear(tt, start, HOME_STATION_M);
  const targets = stationsNear(tt, stop, TRAIL_STATION_M, 2);
  if (!origins.length || !targets.length) return null;
  const access = new Map(origins.map((o) => [o.station, stationAccessMin(o.distance_m)]));
  const [j] = journeys(
    tt,
    day,
    origins.map((o) => ({ station: o.station, accessMin: access.get(o.station)! })),
    targets.map((t) => ({ station: t.station, extraMin: 0 })),
    minutes(time),
    1
  );
  return j ? j.arr - (j.dep - (access.get(j.fromStation) ?? 0)) : null;
}

/**
 * The ride from the visitor's start to each stop of the trip (same order as `stops`): a train from the timetable
 * (real), a bus from the road time (an estimate, there is no free bus timetable). Null while it is unknown: no start,
 * or the timetable or the route is still loading, so nothing shows a stand-in that then jumps.
 * The bus estimate uses the road time to the trail start, as the stops all stand within a short walk of it.
 */
export function useStopRides(stops: readonly TransitStop[], trailStart: LatLng | null): (StopRide | null)[] | null {
  const { start } = useUserLocation();
  const { date, time } = useTripDay();
  const wantsTrain = start !== null && stops.some((s) => s.mode === "vlak");
  const target = trailStart ?? stops[0]?.location ?? null;
  const road = useDriveRoute(start && stops.length ? start : null, target);
  const [tt, setTt] = useState<RailTimetable | null | undefined>(undefined);

  useEffect(() => {
    if (!wantsTrain || tt !== undefined) return;
    let cancelled = false;
    loadRailTimetable().then((t) => !cancelled && setTt(t));
    return () => {
      cancelled = true;
    };
  }, [wantsTrain, tt]);

  const roadMin = road.route?.durationMin ?? (road.status === "error" && start && target ? estimateDriveMin(start, target) : null);

  return useMemo(() => {
    if (!start || !stops.length || roadMin === null || !date || !time) return null;
    if (wantsTrain && tt === undefined) return null;
    const estimate: StopRide = { rideMin: transitMinutes(roadMin), approx: true };
    const day = tt ? dayIndex(tt, date) : -1;
    return stops.map((s) => {
      if (s.mode !== "vlak") return estimate;
      const min = tt ? trainRideMin(tt, day, start, s.location, time) : null;
      // No train that day (or no timetable for it): the estimate the plan falls back on.
      return min === null ? estimate : { rideMin: min, approx: false };
    });
  }, [start, stops, roadMin, date, time, tt, wantsTrain]);
}
