/**
 * The Christmas-holiday block on the big towns' pages (C64b, Peter 14 and 21 Nov 2026): a row of short
 * trips with kids, each with the time to leave home by. The rules live here; lib/townTrips.ts picks the
 * trips and components/TownView.tsx draws the block.
 */
import { inYearlyRange } from "@/lib/closedToday";
import { hikeMinutes, planDay } from "@/lib/dayPlan";
import { floorTo5 } from "@/lib/days";
import { getSunTimes } from "@/lib/sun";
import type { DestinationKind } from "@/lib/tripSchema";
import { clockShort } from "@/lib/zoned";

/** Days the block is on the page ("MM-DD"): from late November, so it is found before the holidays, to their last day. */
export const HOLIDAY_SHOWN = { from: "11-20", to: "01-07" };
/** The school Christmas holidays, as the block's subtitle says them. */
export const HOLIDAY_DATES = { from: "12-23", to: "01-07" };
/** The day the sunset and the "leave by" times are counted for. */
export const HOLIDAY_SUN_DAY = "12-24";

/** A short trip: the walk at normal pace, the drive one way, and how high it goes (above this, expect real winter). */
const MAX_WALK_MIN = 90;
const MAX_DRIVE_MIN = 45;
const MAX_ELE_M = 1000;
/** Gorges have ladders and ice in winter: not a pick for kids at Christmas, however short. */
const NOT_IN_WINTER: DestinationKind[] = ["roklina"];

export const HOLIDAY_TILES = 5;
/** Fewer fitting trips than this and the town gets no block. */
export const HOLIDAY_MIN_TILES = 3;

export function holidayShown(todayMonthDay: string): boolean {
  return inYearlyRange(HOLIDAY_SHOWN.from, HOLIDAY_SHOWN.to, todayMonthDay);
}

/** The year of the holidays' December: 2026 for both November 2026 and January 2027. */
export function holidayYear(today: { y: number; mo: number }): number {
  return today.mo >= 7 ? today.y : today.y - 1;
}

export interface HolidayCandidate {
  kids: boolean;
  kind: DestinationKind;
  carMin: number;
  walkMin: number;
  maxEleM: number | null;
  /** The trip has any closure rule: left out, the block is no place for "check the dates first". */
  hasClosure: boolean;
}

export function fitsHoliday(c: HolidayCandidate): boolean {
  return (
    c.kids &&
    !c.hasClosure &&
    !NOT_IN_WINTER.includes(c.kind) &&
    c.carMin <= MAX_DRIVE_MIN &&
    c.walkMin <= MAX_WALK_MIN &&
    (c.maxEleM === null || c.maxEleM <= MAX_ELE_M)
  );
}

const sunDay = (year: number) => `${year}-${HOLIDAY_SUN_DAY}`;

/** Sunset on the block's day at a place, "16:01". */
export function holidaySunset(year: number, at: { lat: number; lon: number }): string | null {
  const [mo, d] = HOLIDAY_SUN_DAY.split("-").map(Number);
  const sun = getSunTimes(new Date(Date.UTC(year, mo - 1, d)), at.lat, at.lon);
  return sun ? clockShort(sun.sunset) : null;
}

/**
 * The latest time to leave home, "13:40": the trip page's own rule (off the trail half an hour before
 * sunset, lib/dayPlan.ts) at kids' pace, on the 5 minutes before. So the tile and the trip page with
 * "Idete s deťmi?" on say the same time.
 */
export function holidayLeaveBy(year: number, trailhead: { lat: number; lon: number }, carMin: number, walkMin: number): string | null {
  const plan = planDay({ date: sunDay(year), start: "08:00", driveMin: carMin, hikeMin: hikeMinutes(walkMin, true), location: trailhead });
  return plan ? clockShort(floorTo5(plan.latestStart)) : null;
}
