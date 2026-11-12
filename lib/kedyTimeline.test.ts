import { describe, expect, it } from "vitest";
import { planDay } from "@/lib/dayPlan";
import { hourStrip } from "@/lib/hourStrip";
import {
  barEnds,
  barSegments,
  dayBand,
  dayMinutes,
  dryFix,
  hhmmToMin,
  kedyCards,
  keptAfterPick,
  latestWalkStart,
  minToHhmm,
  rowCells,
  rowRange,
  scalePos,
  summaryParts,
  sunMarks,
} from "@/lib/kedyTimeline";
import type { KedyCardInput } from "@/lib/kedyTimeline";
import type { WeatherForecast } from "@/lib/weather";
import { clock, zonedDate } from "@/lib/zoned";

const TATRY = { lat: 49.1, lon: 20.2 };
const DAY = "2026-11-13";
const at = (day: number, h: number, m = 0) => zonedDate(2026, 11, day, h, m);

/** Hourly forecast 12-17 Nov: sleet on the 13th from 8:00 to 10:00, otherwise dry. */
const forecast: WeatherForecast = {
  updated: "",
  steps: Array.from({ length: 24 * 5 }, (_, i) => {
    const day = 12 + Math.floor(i / 24);
    const h = i % 24;
    const wet = day === 13 && h >= 8 && h < 10;
    return { t: at(day, h).toISOString(), temp: wet ? 0 : 2, wind: 2, rain: wet ? 0.4 : 0, hours: 1, symbol: wet ? "sleet" : "partlycloudy_day" };
  }),
};

/** 7 h 10 min of walking and a 55 min ride each way, the walk starting at `start`. */
const planFor = (start: string, date = DAY) => {
  const [h, m] = start.split(":").map(Number);
  const leave = new Date(zonedDate(2026, 11, Number(date.slice(8)), h, m).getTime() - 55 * 60000);
  const p = planDay({ date, start: clock(leave), driveMin: 55, hikeMin: 430, location: TATRY });
  if (!p) throw new Error("no plan");
  return p;
};

const input = (plan = planFor("08:00"), kept: KedyCardInput["kept"] = []): KedyCardInput => ({
  plan,
  forecast: { below: forecast, above: null },
  kept,
  now: at(12, 12),
  sunFor: () => null,
  fits: () => true,
});

describe("the fixed scale", () => {
  it("puts 6:00 at the left and 20:00 at the right, and clamps what lies outside", () => {
    expect(scalePos(360)).toBe(0);
    expect(scalePos(1200)).toBe(1);
    expect(scalePos(540)).toBeCloseTo(3 / 14);
    expect(scalePos(300)).toBe(0);
    expect(scalePos(1300)).toBe(1);
  });
  it("counts minutes from the day of a reference instant, a later day past 1440", () => {
    expect(dayMinutes(at(13, 8, 5), at(13, 0))).toBe(485);
    expect(dayMinutes(at(14, 0, 30), at(13, 12))).toBe(1470);
  });
  it("converts HH:MM and minutes", () => {
    expect(hhmmToMin("08:05")).toBe(485);
    expect(minToHhmm(485)).toBe("08:05");
  });
});

const hikeStrip = (p: ReturnType<typeof planFor>) => hourStrip(forecast, rowRange(p), p.segments[0].start, p.hikeStart, p.hikeEnd, p.segments[p.segments.length - 1].end);

describe("the trip bar", () => {
  const plan = planFor("08:00");
  const strip = hourStrip(forecast, rowRange(plan), plan.segments[0].start, plan.hikeStart, plan.hikeEnd, plan.segments[2].end);
  it("lays the legs on the scale: leave 7:05, walk 8:00-15:10, home 16:05", () => {
    const segs = barSegments(plan, strip);
    expect(segs.map((s) => s.kind)).toEqual(["drive-there", "hike", "drive-back"]);
    expect(segs[0].left).toBeCloseTo(scalePos(7 * 60 + 5));
    expect(segs[1].left + segs[1].width).toBeCloseTo(scalePos(15 * 60 + 10));
    expect(segs[2].left + segs[2].width).toBeCloseTo(scalePos(16 * 60 + 5));
  });
  it("turns the wet hours of the hike amber and the part after sunset hatched", () => {
    const hike = barSegments(plan, strip)[1];
    expect(hike.pieces.map((p) => p.tone)).toEqual(["rain", "base"]);
    expect(hike.pieces[0].left).toBeCloseTo(scalePos(8 * 60));
    expect(hike.pieces[0].left + hike.pieces[0].width).toBeCloseTo(scalePos(10 * 60));
    const late = planFor("10:00");
    const segs = barSegments(late, strip);
    expect(segs[1].pieces.map((p) => p.tone)).toEqual(["base", "dark"]);
    expect(segs[2].pieces.map((p) => p.tone)).toEqual(["dark"]);
  });
  it("paints rain on the hike only, never on a ride leg (by bus, 8:00-9:20 ride, walk from 9:20)", () => {
    const bus = planDay({ date: DAY, start: "08:00", driveMin: null, hikeMin: 300, location: TATRY, travelMode: "transit", fixed: { there: { leave: 480, arrive: 560 }, back: { leave: 860, home: 940 } } })!;
    const s = hikeStrip(bus);
    const segs = barSegments(bus, s);
    expect(segs[0].kind).toBe("drive-there");
    expect(segs[0].pieces.every((p) => p.tone === "base")).toBe(true);
    expect(segs[1].pieces.some((p) => p.tone === "rain")).toBe(true);
    expect(segs[2].pieces.every((p) => p.tone === "base")).toBe(true);
  });
  it("labels both ends with the ride minutes", () => {
    const ends = barEnds(plan);
    expect(ends.leave.rideMin).toBe(55);
    expect(ends.home?.rideMin).toBe(55);
    expect(clock(plan.segments[0].start)).toBe("07:05");
  });
  it("does not move the scale with the chosen time", () => {
    // The same clock time is always the same place; only the boxes move.
    expect(scalePos(8 * 60)).toBeCloseTo(2 / 14);
    expect(barSegments(planFor("10:00"), strip)[1].left).toBeGreaterThan(barSegments(plan, strip)[1].left);
  });
});

describe("the hour row", () => {
  it("has 14 hours, 6 to 19, and rain hours of the hike filled", () => {
    const plan = planFor("08:00");
    const cells = rowCells(plan, hourStrip(forecast, rowRange(plan), plan.segments[0].start, plan.hikeStart, plan.hikeEnd, plan.segments[2].end));
    expect(cells.map((c) => c.h)).toEqual(Array.from({ length: 14 }, (_, i) => 6 + i));
    expect(cells.filter((c) => c.state === "rain").map((c) => c.h)).toEqual([8, 9]);
    expect(cells.filter((c) => c.state === "ring")).toEqual([]);
  });
  it("rings the night hours under the hike instead of filling them", () => {
    const plan = planFor("10:00");
    const cells = rowCells(plan, hourStrip(forecast, rowRange(plan), plan.segments[0].start, plan.hikeStart, plan.hikeEnd, plan.segments[2].end));
    expect(cells.filter((c) => c.state === "ring").map((c) => c.h)).toEqual([16, 17]);
    expect(cells.find((c) => c.h === 18)!.state).toBe("plain");
    expect(cells.find((c) => c.h === 18)!.dark).toBe(true);
  });
  it("draws night, a soft edge and day, and puts the sun marks at their time", () => {
    const plan = planFor("08:00");
    const band = dayBand(plan);
    expect(band.startsWith("linear-gradient(to right, var(--sky-night) 0%")).toBe(true);
    expect(band).toContain("var(--sky-twilight)");
    expect(band.endsWith("var(--sky-night) 100%)")).toBe(true);
    const marks = sunMarks(plan);
    expect(marks.map((m) => m.kind)).toEqual(["rise", "set"]);
    expect(Math.floor(marks[0].min / 60)).toBe(6);
    expect(Math.floor(marks[1].min / 60)).toBe(16);
  });
});

describe("suggested starts", () => {
  it("are on 5 minutes, rounded to the dry side, while the current start keeps its own minutes", () => {
    const cards = kedyCards(input(planFor("08:43")));
    expect(cards[0].start).toBe("08:43");
    const time = cards.find((c) => c.suggested && c.sameDay);
    expect(time).toBeDefined();
    expect(Number(time!.start.slice(3)) % 5).toBe(0);
  });
});

describe("the latest start", () => {
  it("is a WALK start: the latest departure plus the ride, to 5 minutes before", () => {
    const plan = planFor("08:00");
    expect(clock(latestWalkStart(plan))).toBe("08:20");
  });
});

describe("the option cards", () => {
  it("offers the current choice, a dry time later the same day and the nearest dry day", () => {
    const cards = kedyCards(input());
    expect(cards.map((c) => [c.date, c.start, c.selected])).toEqual([
      [DAY, "08:00", true],
      [DAY, "10:00", false],
      ["2026-11-14", "08:00", false],
    ]);
    expect(cards[0].wet).toMatchObject({ kind: "sleet", atStart: true });
    expect(cards[1].wet).toBeNull();
    expect(cards[1].afterSunset).toBe(true);
    expect(cards[1].homeText).toBe("18:05");
    expect(cards[2].best).toBe(true);
    expect(cards[2].tempMin).toBe(2);
    expect(cards[0].skies.length).toBe(4);
  });
  it("keeps the card you left, so the choice can be undone (mockup M1b)", () => {
    const first = kedyCards(input());
    const kept = keptAfterPick(first, first[1]);
    expect(kept.map((k) => [k.date, k.start])).toEqual([[DAY, "08:00"], ["2026-11-14", "08:00"]]);
    const after = kedyCards(input(planFor("10:00"), kept));
    expect(after.map((c) => [c.date, c.start, c.selected])).toEqual([
      [DAY, "10:00", true],
      [DAY, "08:00", false],
      ["2026-11-14", "08:00", false],
    ]);
    expect(after[1].wet?.atStart).toBe(true);
    expect(after[1].homeText).toBe("16:05");
    expect(after[1].afterSunset).toBe(false);
    expect(after[2].best).toBe(true);
  });
  it("offers only the current choice without a forecast", () => {
    const cards = kedyCards({ ...input(), forecast: { below: null, above: null } });
    expect(cards).toHaveLength(1);
    expect(cards[0].known).toBe(false);
    expect(cards[0].skies).toEqual([]);
  });
  it("offers the way out of rain as a tap: the drier time first, else the drier day", () => {
    const cards = kedyCards(input());
    expect(dryFix(cards)).toEqual({ kind: "time", start: "10:00", way: "dry" });
    expect(dryFix(cards.filter((c) => c.sameDay === false || c.selected))).toEqual({ kind: "day", date: "2026-11-14", start: "08:00" });
    expect(dryFix([cards[0]])).toBeNull();
  });
});

describe("the folded header", () => {
  it("gives the walk's span and when you are home", () => {
    expect(summaryParts(planFor("08:00"))).toEqual({ start: "8:00", end: "15:10", home: "16:05" });
    expect(summaryParts(planFor("10:00"))).toEqual({ start: "10:00", end: "17:10", home: "18:05" });
  });
  it("has no home time when there is no way back", () => {
    const p = planDay({ date: DAY, start: "08:00", driveMin: null, hikeMin: 430, location: TATRY })!;
    expect(summaryParts(p).home).toBeNull();
  });
});
