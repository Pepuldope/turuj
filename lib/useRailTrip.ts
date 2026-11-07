"use client";

import { useEffect, useMemo, useState } from "react";
import { dayIndex, journeys, loadRailTimetable, stationsNear, timetableChangeDay } from "@/lib/rail";
import type { RailJourney, RailTimetable, StationNear } from "@/lib/rail";
import type { LatLng } from "@/lib/types";

/** Stations this far from the start are worth riding to; further, a bus is the way. */
const HOME_STATION_M = 6000;
/** The train station a trail stop stands for (OSM and the timetable place it a little differently). */
const TRAIL_STATION_M = 800;
/** For "vyrazte najneskôr": connections from this time (minutes), at most this many. */
const DAY_FROM = 4 * 60;
const DAY_COUNT = 30;
/** Back at the station from the trail: a few minutes to buy a ticket and find the platform. */
const STATION_SLACK_MIN = 5;
/** Up to this, walk to the station; further, a city bus or a lift (rough, shown in the plan). */
const WALK_M = 1200;

/** Minutes from the start to a station: a walk when close, else a short ride; rounded up to 5. */
export function stationAccessMin(distanceM: number): number {
  const min = distanceM <= WALK_M ? (distanceM * 1.25) / 66 : 10 + distanceM / 350;
  return Math.max(5, Math.ceil(min / 5) * 5);
}

export interface RailTrip {
  /** "loading" while the timetable loads; "none" when trains don't make this trip on this day. */
  status: "loading" | "ok" | "none" | "no-day";
  there: RailJourney[];
  back: RailJourney[];
  thereChoice: number;
  backChoice: number;
  chooseThere: (i: number) => void;
  chooseBack: (i: number) => void;
  /** The station you leave from and how long it takes to get there (for the chosen connection). */
  homeStation: StationNear | null;
  accessMin: number;
  /** All of the day's connections from early morning (for "vyrazte najneskôr"), with their access minutes. */
  day: { dep: number; arr: number; leave: number }[];
  /** "13. 12." when the trip day is after the timetable file ends (status "no-day"), else null. */
  changeDay: string | null;
}

const NONE: Omit<RailTrip, "chooseThere" | "chooseBack"> = {
  status: "none",
  there: [],
  back: [],
  thereChoice: 0,
  backChoice: 0,
  homeStation: null,
  accessMin: 0,
  day: [],
  changeDay: null,
};

/** Minutes after midnight from "HH:MM". */
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Real train connections for the day: from the stations near the start to the
 * station by the trail (leaving at or after `time`), and back once the walk is
 * done. `hikeMin` includes the walk between the station and the trail.
 */
export function useRailTrip(
  start: LatLng | null,
  station: LatLng | null,
  date: string | null,
  time: string | null,
  hikeMin: number
): RailTrip {
  const [tt, setTt] = useState<RailTimetable | null | undefined>(undefined);
  const [pick, setPick] = useState<{ key: string; there: number; back: number | null }>({ key: "", there: 0, back: null });
  const active = start !== null && station !== null;

  useEffect(() => {
    if (!active || tt !== undefined) return;
    let cancelled = false;
    loadRailTimetable().then((t) => !cancelled && setTt(t));
    return () => {
      cancelled = true;
    };
  }, [active, tt]);

  const there = useMemo(() => {
    if (!active || !date || !time || !tt) return null;
    const day = dayIndex(tt, date);
    if (day < 0) return { day, origins: [], targets: [], list: [] as RailJourney[] };
    const origins = stationsNear(tt, start!, HOME_STATION_M);
    const targets = stationsNear(tt, station!, TRAIL_STATION_M, 2);
    const list =
      origins.length && targets.length
        ? journeys(
            tt,
            day,
            origins.map((o) => ({ station: o.station, accessMin: stationAccessMin(o.distance_m) })),
            targets.map((t) => ({ station: t.station, extraMin: 0 })),
            minutes(time)
          )
        : [];
    return { day, origins, targets, list };
  }, [active, tt, start, station, date, time]);

  // The whole day's connections, to find the last one that still gets you down in daylight.
  const allDay = useMemo(() => {
    if (!tt || !there || there.day < 0 || !there.origins.length || !there.targets.length) return [];
    const access = new Map(there.origins.map((o) => [o.station, stationAccessMin(o.distance_m)]));
    return journeys(
      tt,
      there.day,
      there.origins.map((o) => ({ station: o.station, accessMin: access.get(o.station)! })),
      there.targets.map((t) => ({ station: t.station, extraMin: 0 })),
      DAY_FROM,
      DAY_COUNT
    ).map((j) => ({ dep: j.dep, arr: j.arr, leave: j.dep - (access.get(j.fromStation) ?? 0) }));
  }, [tt, there]);

  const key = `${date} ${time} ${start?.lat},${start?.lon} ${station?.lat},${station?.lon}`;
  const thereChoice = pick.key === key ? Math.min(pick.there, Math.max(0, (there?.list.length ?? 1) - 1)) : 0;
  const chosen = there?.list[thereChoice] ?? null;
  const homeStation = chosen ? (there!.origins.find((o) => o.station === chosen.fromStation) ?? null) : null;
  const accessMin = homeStation ? stationAccessMin(homeStation.distance_m) : 0;

  const back = useMemo(() => {
    if (!tt || !there || !chosen) return [];
    const done = chosen.arr + hikeMin + STATION_SLACK_MIN;
    return journeys(
      tt,
      there.day,
      [{ station: chosen.toStation, accessMin: 0 }],
      there.origins.map((o) => ({ station: o.station, extraMin: stationAccessMin(o.distance_m) })),
      done
    );
  }, [tt, there, chosen, hikeMin]);
  const backChoice = pick.key === key && pick.back !== null ? Math.min(pick.back, Math.max(0, back.length - 1)) : 0;

  const chooseThere = (i: number) => setPick({ key, there: i, back: null });
  const chooseBack = (i: number) => setPick({ key, there: thereChoice, back: i });

  if (!active) return { ...NONE, chooseThere, chooseBack };
  if (tt === undefined) return { ...NONE, status: "loading", chooseThere, chooseBack };
  if (there && there.day < 0) return { ...NONE, status: "no-day", changeDay: date && tt ? timetableChangeDay(tt, date) : null, chooseThere, chooseBack };
  if (!chosen) return { ...NONE, chooseThere, chooseBack };
  return { status: "ok", there: there!.list, back, thereChoice, backChoice, chooseThere, chooseBack, homeStation, accessMin, day: allDay, changeDay: null };
}
