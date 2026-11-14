"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { approachMin } from "@/lib/dayPlan";
import { useTripSettings } from "@/lib/tripSettings";
import type { TrailJoin } from "@/lib/trailJoin";
import type { WalkLine } from "@/lib/tripSchema";
import { stopsByWalk, walkFacts } from "@/lib/walkFacts";
import { pickPosition, rankStops } from "@/lib/stopPick";
import type { StopTotal } from "@/lib/stopPick";
import { useStopRides } from "@/lib/useStopRides";
import { useUserLocation } from "@/lib/userLocation";
import type { WalkFacts } from "@/lib/walkFacts";
import type { LatLng, ParkingLot, TransitStop } from "@/lib/types";
import "@/lib/legacyStorage";

/**
 * How the car reaches the trail on the trip page: which parking the visitor
 * picked, where the drive ends and how far it is on foot to the start. The
 * plan, the map, the parking card and the navigation buttons all read it, so
 * picking another parking updates all of them at once.
 */
export interface TripAccess {
  parkingLots: ParkingLot[];
  /** Index into parkingLots; 0 = our default (nearest good one). */
  choice: number;
  choose: (index: number) => void;
  parking: ParkingLot | null;
  /** Where the ride from the start ends: the parking by car, the stop by train or bus. */
  rideTo: LatLng | null;
  /** Where the walk starts: the trail's first point. */
  trailStart: LatLng | null;
  /** Where the drive ends: the chosen parking, else the trail start (routing snaps it to the nearest road). */
  destination: LatLng | null;
  /** Parking -> trail start on foot, one way, minutes (0 when close or no parking). */
  parkingApproachMin: number;
  /**
   * Stops near the trail: fastest door to trail first when the start is known (lib/stopPick.ts), else nearest walk first.
   * The first is the default; a bus within ~10 % of a faster train comes before it.
   */
  stops: TransitStop[];
  /** Index into stops; 0 = the default. */
  stopChoice: number;
  chooseStop: (index: number) => void;
  /** The picked stop, as an index into the nearest-walk order (stable: what a shared link and a saved trip carry). */
  stopPick: number;
  pickStop: (walkIndex: number) => void;
  /** Per stop (same order as `stops`): minutes from the start to the trail start, null while unknown or without a start. */
  stopTotals: (StopTotal | null)[];
  /** A start is set but the rides to the stops are still loading: show no stand-in time. */
  stopsPending: boolean;
  /** The picked stop (by default the fastest). */
  stop: TransitStop | null;
  /** By car: the drive goes on. By train/bus: an estimated ride to the stop, the walk starts there. */
  transit: boolean;
  /** No car park at this start, only a stop: bus or train whatever the remembered choice. */
  noCar: boolean;
  /** No stop near this start, only a car park: by car whatever the remembered choice. */
  noBus: boolean;
  /** Where the walk to the trail starts: the chosen parking, or the stop. */
  walkFrom: LatLng | null;
  /** That walk on paths, worked out weekly (null: none stored, ask the router). */
  walkLine: WalkLine | null;
  /** Walk to the trail for the chosen way of travel, one way, minutes. */
  approachMin: number;
  /** Where that walk reaches the trail: its start, or its nearest point when parked up the trail. */
  trailJoin: LatLng | null;
  /** Parked or got off up the trail: the part of the walk skipped (null = the whole trail). */
  skip: Pick<TrailJoin, "skip_out" | "skip_back" | "skip_m" | "skip_ascent_m"> | null;
  /** The walk from there (lib/walkFacts.ts): what the facts, the route list and the day all count. */
  walk: WalkFacts;
  /**
   * Pešo: the group walks from its start to the trail (set by the planner). No parking or stop then
   * (Peter, 2026-10-28: on foot you don't go to a parking, you don't even need to see them).
   */
  walking: boolean;
  setWalking: (on: boolean) => void;
}

const Ctx = createContext<TripAccess>({
  parkingLots: [],
  choice: 0,
  choose: () => {},
  parking: null,
  trailStart: null,
  destination: null,
  rideTo: null,
  parkingApproachMin: 0,
  stops: [],
  stopChoice: 0,
  chooseStop: () => {},
  stopPick: 0,
  pickStop: () => {},
  stopTotals: [],
  stopsPending: false,
  stop: null,
  transit: false,
  noCar: false,
  noBus: false,
  walkFrom: null,
  walkLine: null,
  approachMin: 0,
  trailJoin: null,
  skip: null,
  walk: { min: 0, m: 0, ascentM: 0, approachMin: 0, skipped: false },
  walking: false,
  setWalking: () => {},
});

// Picks are remembered per trip for this browser session (back and forth between pages).
const PARKING_KEY = "turuj-parking";
const STOP_KEY = "turuj-stop";
const EVENT = "turuj-parking";

function readAll(key: string): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Which of `count` options is picked for this trip (0 = our default), and a setter. */
function usePick(key: string, slug: string, count: number): [number, (index: number) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => readAll(key)[slug] ?? 0,
    () => 0
  );
  const pick = useCallback(
    (index: number) => {
      try {
        sessionStorage.setItem(key, JSON.stringify({ ...readAll(key), [slug]: index }));
      } catch {
        // Storage blocked: the pick lasts until the next render only.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key, slug]
  );
  return [stored >= 0 && stored < count ? stored : 0, pick];
}

/** The stop the visitor picked themselves for this trip, as an index into the nearest-walk order; null = none (take the default). */
function useStopPick(slug: string): [number | null, (index: number) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => readAll(STOP_KEY)[slug] ?? -1,
    () => -1
  );
  const pick = useCallback(
    (index: number) => {
      try {
        sessionStorage.setItem(STOP_KEY, JSON.stringify({ ...readAll(STOP_KEY), [slug]: index }));
      } catch {
        // Storage blocked: the pick lasts until the next render only.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [slug]
  );
  return [stored >= 0 ? stored : null, pick];
}

export function TripAccessProvider({
  slug,
  parkingLots,
  transitStops,
  trailStart,
  trail,
  children,
}: {
  slug: string;
  /** The route's own numbers, from its start. */
  trail: { distance_m: number; ascent_m: number; duration_min: number };
  parkingLots: ParkingLot[];
  transitStops: TransitStop[];
  trailStart: LatLng | null;
  children: ReactNode;
}) {
  const [choice, choose] = usePick(PARKING_KEY, slug, parkingLots.length);
  // Nearest walk to the trail first (a stop up the trail counts from where it joins): the stable order saved picks refer to.
  const byWalk = useMemo(() => stopsByWalk(transitStops), [transitStops]);
  // From a known start, the stops are listed fastest first (ride + walk); the default is the first (lib/stopPick.ts).
  const { start } = useUserLocation();
  const rides = useStopRides(byWalk, trailStart);
  const ranking = useMemo(() => rankStops(byWalk, rides), [byWalk, rides]);
  const stops = useMemo(() => ranking.order.map((i) => byWalk[i]), [ranking, byWalk]);
  const stopTotals = useMemo(() => ranking.order.map((i) => ranking.totals[i]), [ranking]);
  const stopsPending = start !== null && byWalk.length > 0 && rides === null;
  const [saved, pickStop] = useStopPick(slug);
  const stopChoice = pickPosition(ranking.order, saved !== null && saved < byWalk.length ? saved : null);
  const stopPick = ranking.order[stopChoice] ?? 0;
  const chooseStop = useCallback((index: number) => pickStop(ranking.order[index] ?? 0), [pickStop, ranking]);
  // Without a car park the bus is the only way; the remembered choice stays as it is for other trips.
  const noCar = parkingLots.length === 0 && transitStops.length > 0;
  // And the other way round: with no stop, a remembered "bus" would leave the day without a ride at all.
  const noBus = transitStops.length === 0;
  const { travel } = useTripSettings();
  const [walking, setWalking] = useState(false);
  const transit = noCar || (travel === "transit" && !noBus);

  const value = useMemo<TripAccess>(() => {
    if (walking) {
      // On foot from the start: the walk begins at the trail's first point, nothing to park or catch.
      return {
        parkingLots: [],
        choice: 0,
        choose,
        parking: null,
        trailStart,
        destination: null,
        rideTo: null,
        parkingApproachMin: 0,
        stops: [],
        stopChoice: 0,
        chooseStop,
        stopPick: 0,
        pickStop,
        stopTotals: [],
        stopsPending: false,
        stop: null,
        transit: false,
        noCar,
        noBus,
        walkFrom: null,
        walkLine: null,
        approachMin: 0,
        trailJoin: trailStart,
        skip: null,
        walk: walkFacts(trail, null),
        walking,
        setWalking,
      };
    }
    const parking = parkingLots[choice] ?? null;
    const stop = stops[stopChoice] ?? null;
    const walk = walkFacts(trail, transit ? stop : parking);
    const parkingApproach = parking ? approachMin(parking.join?.walk_m ?? parking.walk_m) : 0;
    const join = transit ? (stop?.join ?? null) : (parking?.join ?? null);
    return {
      parkingLots,
      choice,
      choose,
      parking,
      trailStart,
      destination: transit ? null : (parking?.location ?? trailStart),
      rideTo: transit ? (stop?.location ?? null) : (parking?.location ?? trailStart),
      parkingApproachMin: parkingApproach,
      stops,
      stopChoice,
      chooseStop,
      stopPick,
      pickStop,
      stopTotals,
      stopsPending,
      stop,
      transit,
      noCar,
      noBus,
      walkFrom: transit ? (stop?.location ?? null) : (parking?.location ?? null),
      walkLine: transit ? (stop?.walk ?? null) : (parking?.walk ?? null),
      approachMin: walk.approachMin,
      trailJoin: join?.location ?? trailStart,
      skip: join && join.skip_m > 0 ? join : null,
      walk,
      walking,
      setWalking,
    };
  }, [parkingLots, stops, stopTotals, stopsPending, stopPick, pickStop, choice, choose, stopChoice, chooseStop, trailStart, trail, transit, noCar, noBus, walking]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTripAccess(): TripAccess {
  return useContext(Ctx);
}
