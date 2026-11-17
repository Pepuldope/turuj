"use client";

import { useMemo } from "react";
import { SAFE_MARGIN_MIN, atDayMinute, hikeMinutes, planDay } from "@/lib/dayPlan";
import type { DayPlan, FixedRide } from "@/lib/dayPlan";
import { estimateDriveMin, quickDriveMin, transitMinutes } from "@/lib/drive";
import type { DriveRoute } from "@/lib/drive";
import { useDriveRoute, useTownDrives } from "@/lib/useDriveRoute";
import { useTripStops } from "@/lib/tripStops";
import { useRailTrip } from "@/lib/useRailTrip";
import type { RailTrip } from "@/lib/useRailTrip";
import type { DriveStatus } from "@/lib/useDriveRoute";
import { useTripDay, useTripSettings } from "@/lib/tripSettings";
import { useUserLocation } from "@/lib/userLocation";
import type { LatLng } from "@/lib/types";

export interface TripPlan {
  plan: DayPlan | null;
  /** The day and departure planned for (null until hydrated). */
  date: string | null;
  time: string | null;
  /** Walking time for this group (kids pace applied). */
  hikeMin: number;
  /** One-way travel used in the plan (the drive, or the estimated bus/train ride); null without a start. */
  driveMin: number | null;
  /** The same trip by car, one way (shown next to "Autom" while planning by bus). */
  roadMin: number | null;
  /** driveMin is a straight-line estimate because routing failed. */
  driveApprox: boolean;
  /** Travelling by bus or train: driveMin is the ride, an estimate unless `rail` found real trains. */
  transit: boolean;
  /** Real train connections, when the stop is a train station and trains make the trip. */
  rail: RailTrip;
  /** The timetabled train ride the plan uses, if any (saved with the trip so the saved day matches). */
  fixed: FixedRide | null;
  withKids: boolean;
  driveStatus: DriveStatus;
  /** The drive or the train times are still loading: the plan will still change. */
  loading: boolean;
  route: DriveRoute | null;
}

/**
 * One trail's day, from the shared inputs (start, day, departure, kids). Cheap to call in several places.
 * `destination` is where the ride ends: the parking by car, the stop by bus or train.
 */
export function useTripPlan(
  sun: LatLng | null,
  destination: LatLng | null,
  baseHikeMin: number,
  railStation: LatLng | null = null,
  /** By bus or train (useTripAccess decides: the remembered choice, unless the start has only one of a car park or a stop). */
  transit = false,
  /** The trip, to look it up in the start town's weekly drive table while the exact route loads. */
  slug: string | null = null,
  /** Walking from the start (Pešo, a start close to the trail): minutes one way, added to the walk; no ride. */
  walkThereMin: number | null = null,
  /** Time spent at the goal (C190, lib/goalStay.ts): on top of the walk, like a stop. */
  goalStayMin = 0
): TripPlan {
  const walking = walkThereMin !== null;
  const { start } = useUserLocation();
  const { withKids } = useTripSettings();
  const { date, time } = useTripDay();
  const drive = useDriveRoute(start, destination);
  const { minutes: stopMin } = useTripStops(slug);
  // Stops the group added (a buffet, a side trip, lunch) lengthen the day at their own pace, not the kids'.
  const hikeMin = hikeMinutes(baseHikeMin + (walkThereMin ?? 0) * 2, withKids) + stopMin + goalStayMin;
  const driveApprox = drive.status === "error" && start !== null && destination !== null;
  // While the exact route loads, the day is drawn from a distance estimate ("~"), not left waiting.
  const driveGuess = (driveApprox || drive.status === "loading") && start !== null && destination !== null;
  // The same number the home list showed for this trip, until the router's answer replaces it.
  const { drives } = useTownDrives(drive.status === "loading" ? start : null);
  const tableMin = slug ? (drives?.minutes[slug] ?? null) : null;
  const guessMin = driveGuess ? (drive.status === "loading" ? quickDriveMin(start!, destination!, drives, tableMin) : estimateDriveMin(start!, destination!)) : null;
  const roadMin = drive.route?.durationMin ?? guessMin;
  const rail = useRailTrip(start, transit && !walking ? railStation : null, date, time, hikeMin);
  const there = rail.status === "ok" ? rail.there[rail.thereChoice] : null;
  const back = rail.status === "ok" ? (rail.back[rail.backChoice] ?? null) : null;
  const fixed = there
    ? {
        there: { leave: there.dep - rail.accessMin, arrive: there.arr },
        back: back ? { leave: back.dep, home: back.arr + rail.accessMin } : null,
      }
    : null;
  const driveMin = walking ? null : fixed ? fixed.there.arrive - fixed.there.leave : roadMin !== null && transit ? transitMinutes(roadMin) : roadMin;
  const approx = walking ? false : fixed ? false : transit || driveGuess;

  const plan = useMemo(
    () => {
      const p = date && time && sun ? planDay({ date, start: time, driveMin, hikeMin, location: sun, travelMode: transit && !walking ? "transit" : "auto", approx, fixed }) : null;
      // By train, the latest departure is a real train: the last one that still gets you off the trail in time.
      if (p && fixed && rail.day.length) {
        const ok = rail.day.filter((j) => atDayMinute(date!, j.arr + hikeMin + SAFE_MARGIN_MIN) <= p.sunset);
        // No train makes it: the first train is no "leave by" time, the page says no train fits instead.
        const last = ok[ok.length - 1] ?? rail.day[0];
        p.latestStart = atDayMinute(date!, last.leave);
        p.noTrainInLight = ok.length === 0;
      }
      return p;
    },
    // fixed is rebuilt every render; its numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, time, driveMin, hikeMin, sun, transit, walking, approx, rail.day, fixed?.there.leave, fixed?.there.arrive, fixed?.back?.leave, fixed?.back?.home]
  );

  const loading = drive.status === "loading" || rail.status === "loading";
  return { plan, date, time, hikeMin, driveMin, roadMin, driveApprox: walking ? false : driveApprox, transit: transit && !walking, rail, fixed, withKids, driveStatus: drive.status, loading, route: drive.route };
}
