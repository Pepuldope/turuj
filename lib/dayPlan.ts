/**
 * The day of a trip laid against daylight: drive there, hike, drive back.
 *
 * Pure and dependency-free so the safety-relevant part (are you off the trail
 * before dark?) is unit tested. "Before dark" is measured at the END OF THE
 * HIKE, not at home: driving back after sunset is fine, walking a forest trail
 * after it is the beginner mistake this app exists to prevent.
 */
import { CIVIL_TWILIGHT_DEG, getSunTimes } from "@/lib/sun";
import type { LatLng } from "@/lib/types";
import { zonedDate } from "@/lib/zoned";

export type SegmentKind = "drive-there" | "hike" | "drive-back";

export interface Segment {
  kind: SegmentKind;
  start: Date;
  end: Date;
}

/**
 * ok          - off the trail at least COMFORT_MARGIN_MIN (an hour) before sunset
 * close       - SAFE_MARGIN_MIN..COMFORT_MARGIN_MIN before sunset: fine, a light note
 * tight       - before sunset, but with less than SAFE_MARGIN_MIN to spare
 * after-sunset - finishing in twilight (sunset .. civil dusk)
 * after-dusk  - finishing in the dark
 */
export type Verdict = "ok" | "close" | "tight" | "after-sunset" | "after-dusk";

export interface DayPlan {
  segments: Segment[];
  /** Start of civil twilight. */
  dawn: Date;
  sunrise: Date;
  sunset: Date;
  /** End of civil twilight. */
  dusk: Date;
  hikeStart: Date;
  hikeEnd: Date;
  /** Minutes between the end of the hike and sunset; negative = after sunset. */
  marginMin: number;
  verdict: Verdict;
  /** The hike would start before sunrise. */
  startsInDark: boolean;
  /** Latest departure (or hike start, without a drive) that still ends the hike SAFE_MARGIN_MIN before sunset. */
  latestStart: Date;
  /** By train: no train of the day gets the walk done SAFE_MARGIN_MIN before sunset (latestStart is then no advice). */
  noTrainInLight?: boolean;
  /** How the "drive" segments travel: by car, or by bus/train. */
  travelMode: TravelMode;
  /** The travel times are an estimate (a bus guessed from the road time, a drive from the distance). */
  approx: boolean;
}

/**
 * Where the walk leaves daylight: "late" when the hike ends after sunset, "early" when it starts before
 * sunrise (and does not end after sunset), null inside daylight. For rules that allow walking only by day (TANAP).
 */
export function outsideDaylight(plan: Pick<DayPlan, "hikeEnd" | "sunset" | "startsInDark">): "late" | "early" | null {
  if (plan.hikeEnd > plan.sunset) return "late";
  return plan.startsInDark ? "early" : null;
}

export type TravelMode = "auto" | "transit";

/** A real train trip, minutes after midnight of the plan's date: leave home, reach the stop; leave the stop, be home. */
export interface FixedRide {
  there: { leave: number; arrive: number };
  back: { leave: number; home: number } | null;
}

export interface DayPlanInput {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local time the day starts, HH:MM: leaving home, or the hike itself when driveMin is null. */
  start: string;
  /** One-way drive in minutes; null when unknown (no start point / offline). */
  driveMin: number | null;
  hikeMin: number;
  /** Where the sun is computed (trailhead or parking). */
  location: LatLng;
  travelMode?: TravelMode;
  approx?: boolean;
  /** Timetabled ride (trains): replaces `start` and `driveMin` for the times of the day. */
  fixed?: FixedRide | null;
}

/** "Vyraz najneskôr" gets you off the trail this long before sunset (PD4; tune after tests). */
export const SAFE_MARGIN_MIN = 30;
/** HZS advises being down about an hour before dark; less than this gets a light note. */
export const COMFORT_MARGIN_MIN = 60;
/** With kids, walking takes this much longer (PD4; tune after tests). */
export const KIDS_PACE = 1.3;

/** Walking time for this group, rounded to 5 min. */
export function hikeMinutes(baseMin: number, withKids: boolean): number {
  return withKids ? Math.round((baseMin * KIDS_PACE) / 5) * 5 : baseMin;
}

/** Walking pace for the stretch from the car to the trail start: 4 km/h on paths ~1.25x the straight line. */
const APPROACH_M_PER_MIN = 4000 / 60 / 1.25;

/**
 * Minutes to walk from the parking to the trail start, one way, rounded up to
 * 5. Under 150 m it's part of getting ready, not worth a line in the plan.
 */
export function approachMin(walkM: number): number {
  if (walkM < 150) return 0;
  return Math.ceil(walkM / APPROACH_M_PER_MIN / 5) * 5;
}

const MIN = 60000;

function addMin(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MIN);
}

/**
 * Slovak wall-clock time `minutes` after midnight on the given day (train
 * times are minutes after midnight). Not midnight + elapsed minutes: on the
 * day the clocks change that lands an hour off. The missing and doubled 02:xx
 * of those nights follow `zonedDate`.
 */
export function atDayMinute(date: string, minutes: number): Date {
  const [y, mo, d] = date.split("-").map(Number);
  return zonedDate(y, mo, d, 0, minutes);
}

/** Returns null for unparseable input or a date with no sunset (polar regions). */
export function planDay(input: DayPlanInput): DayPlan | null {
  const [y, mo, d] = input.date.split("-").map(Number);
  const [h, mi] = input.start.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return null;

  // Slovak wall-clock time, whatever the device's timezone: the trip is in
  // Slovakia. Sun times are absolute instants, so the two compare correctly.
  const fixed = input.fixed ?? null;
  const dayStart = fixed ? atDayMinute(input.date, fixed.there.leave) : zonedDate(y, mo, d, h, mi);
  const utcDay = new Date(Date.UTC(y, mo - 1, d));
  const sun = getSunTimes(utcDay, input.location.lat, input.location.lon);
  const twilight = getSunTimes(utcDay, input.location.lat, input.location.lon, CIVIL_TWILIGHT_DEG);
  if (!sun || !twilight) return null;

  const drive = fixed ? fixed.there.arrive - fixed.there.leave : (input.driveMin ?? 0);
  const segments: Segment[] = [];
  const hikeStart = addMin(dayStart, drive);
  const hikeEnd = addMin(hikeStart, input.hikeMin);

  if (fixed || input.driveMin !== null) {
    segments.push({ kind: "drive-there", start: dayStart, end: hikeStart });
  }
  segments.push({ kind: "hike", start: hikeStart, end: hikeEnd });
  if (fixed?.back) {
    // From the end of the walk: waiting at the station counts as part of the way home.
    segments.push({ kind: "drive-back", start: hikeEnd, end: atDayMinute(input.date, Math.max(fixed.back.home, fixed.back.leave)) });
  } else if (input.driveMin !== null && !fixed) {
    // By train with no train back that day, the way home is unknown: no made-up "doma" time.
    segments.push({ kind: "drive-back", start: hikeEnd, end: addMin(hikeEnd, drive) });
  }

  const marginMin = Math.round((sun.sunset.getTime() - hikeEnd.getTime()) / MIN);
  const verdict: Verdict =
    hikeEnd > twilight.sunset
      ? "after-dusk"
      : marginMin < 0
        ? "after-sunset"
        : marginMin < SAFE_MARGIN_MIN
          ? "tight"
          : marginMin < COMFORT_MARGIN_MIN
            ? "close"
            : "ok";

  return {
    segments,
    dawn: twilight.sunrise,
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    dusk: twilight.sunset,
    hikeStart,
    hikeEnd,
    marginMin,
    verdict,
    startsInDark: hikeStart < sun.sunrise,
    latestStart: addMin(sun.sunset, -(SAFE_MARGIN_MIN + input.hikeMin + drive)),
    travelMode: input.travelMode ?? "auto",
    approx: input.approx ?? false,
  };
}
