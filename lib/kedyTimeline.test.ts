import { describe, expect, it } from "vitest";
import { planDay } from "@/lib/dayPlan";
import { hourStrip } from "@/lib/hourStrip";
import {
  VISIBLE_HOURS,
  barEnds,
  barSegments,
  darkSpans,
  dayTiles,
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
});

describe("the fixed scale", () => {
  it("covers the whole day: 0:00 at the left, 24:00 at the right, clamped beyond", () => {
    expect(scalePos(0)).toBe(0);
    expect(scalePos(1440)).toBe(1);
    expect(scalePos(480)).toBeCloseTo(1 / 3);
    expect(scalePos(-30)).toBe(0);
    expect(scalePos(1500)).toBe(1);
  });
  it("keeps every hour as wide as on the old 6-20 scale: the track is 24/14 of the card", () => {
    expect(VISIBLE_HOURS).toBe(14);
    expect(scalePos(61) - scalePos(1)).toBeCloseTo(1 / 24);
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
    expect(scalePos(8 * 60)).toBeCloseTo(1 / 3);
    expect(barSegments(planFor("10:00"), strip)[1].left).toBeGreaterThan(barSegments(plan, strip)[1].left);
  });
});

describe("the hour row", () => {
  it("has one cell for each of the 24 hours, and rain hours of the hike filled", () => {
    const plan = planFor("08:00");
    const cells = rowCells(plan, hourStrip(forecast, rowRange(plan), plan.segments[0].start, plan.hikeStart, plan.hikeEnd, plan.segments[2].end));
    expect(cells.map((c) => c.h)).toEqual(Array.from({ length: 24 }, (_, i) => i));
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
  it("offers the current choice and a dry time later the same day (other days are the day tiles)", () => {
    const cards = kedyCards(input());
    expect(cards.map((c) => [c.date, c.start, c.selected])).toEqual([
      [DAY, "08:00", true],
      [DAY, "10:00", false],
    ]);
    expect(cards[0].wet).toMatchObject({ kind: "sleet", atStart: true });
    expect(cards[1].wet).toBeNull();
    expect(cards[1].afterSunset).toBe(true);
    expect(cards[1].homeText).toBe("18:05");
    expect(cards[0].skies.length).toBe(4);
  });
  it("keeps the card you left, so the choice can be undone (mockup M1b)", () => {
    const first = kedyCards(input());
    const kept = keptAfterPick(first, first[1]);
    expect(kept.map((k) => [k.date, k.start])).toEqual([[DAY, "08:00"]]);
    const after = kedyCards(input(planFor("10:00"), kept));
    expect(after.map((c) => [c.date, c.start, c.selected])).toEqual([
      [DAY, "10:00", true],
      [DAY, "08:00", false],
    ]);
    expect(after[1].wet?.atStart).toBe(true);
    expect(after[1].homeText).toBe("16:05");
    expect(after[1].afterSunset).toBe(false);
  });
  it("offers only the current choice without a forecast", () => {
    const cards = kedyCards({ ...input(), forecast: { below: null, above: null } });
    expect(cards).toHaveLength(1);
    expect(cards[0].known).toBe(false);
    expect(cards[0].skies).toEqual([]);
  });
  it("offers the way out of rain as a tap: the drier time the same day", () => {
    const cards = kedyCards(input());
    expect(dryFix(cards)).toEqual({ kind: "time", start: "10:00", way: "dry" });
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

describe("the night tint of the bar", () => {
  it("is one span from sunset to home across the legs, none when the trip ends by day", () => {
    const late = planFor("10:00");
    const spans = darkSpans(late);
    expect(spans).toHaveLength(1);
    expect(spans[0].outer).toBe("right");
    expect(spans[0].left).toBeCloseTo(scalePos(dayMinutes(late.sunset, late.hikeStart)));
    expect(spans[0].left + spans[0].width).toBeCloseTo(scalePos(18 * 60 + 5));
    expect(darkSpans(planDay({ date: DAY, start: "08:00", driveMin: 55, hikeMin: 300, location: TATRY })!)).toEqual([]);
  });
  it("also covers a start before sunrise, rounded at the left", () => {
    const early = planFor("06:00");
    const spans = darkSpans(early);
    expect(spans[0].outer).toBe("left");
    expect(spans[0].left).toBeCloseTo(scalePos(5 * 60 + 5));
  });
});

describe("the day tiles", () => {
  const tiles = (plan = planFor("08:00"), over: Partial<Parameters<typeof dayTiles>[0]> = {}) =>
    dayTiles({ plan, forecast: { below: forecast, above: null }, today: "2026-11-12", now: at(12, 12), count: 9, sunFor: () => null, closed: () => false, ...over });
  it("has one tile per day from today, the picked one selected", () => {
    const t = tiles();
    expect(t).toHaveLength(9);
    expect(t.map((x) => x.when).slice(0, 3)).toEqual(["today", "tomorrow", "date"]);
    expect(t.find((x) => x.selected)!.iso).toBe(DAY);
  });
  it("shows the walk's weather at the chosen start on each day, and marks the wet one", () => {
    const t = tiles();
    expect(t[1].kind).toBe("sleet");
    expect(t[1].dry).toBe(false);
    expect(t[2].kind).toBe("partly");
    expect(t[2].dry).toBe(true);
    expect(t[2].tempMax).toBe(2);
    expect(t[7].kind).toBeNull(); // past the forecast
  });
  it("marks the driest day that works as best: the earliest of the dry ones, never one already gone or without a forecast", () => {
    const t = tiles();
    // Today 12 Nov 8:00 is already behind (it is noon), the 13th is wet: the 14th is the first dry day.
    expect(t.filter((x) => x.best).map((x) => x.iso)).toEqual(["2026-11-14"]);
  });
  it("washes out a day too short for the walk, or closed, and never picks it as best", () => {
    const t = tiles(planFor("08:00"), { sunFor: (iso) => (iso === "2026-11-14" ? { sunrise: at(14, 6, 50), sunset: at(14, 14, 0) } : null), closed: (iso) => iso === "2026-11-15" });
    expect(t[2].state).toBe("short");
    expect(t[3].state).toBe("closed");
    expect(t.filter((x) => x.best).map((x) => x.iso)).toEqual(["2026-11-16"]);
  });
  it("calls a day short only when the walk cannot be done in daylight at all, not from the chosen start", () => {
    // 7 h 10 min of walking: sunrise 6:50 and sunset 16:04 leave room (the latest start 8:24 is after sunrise).
    expect(tiles(planFor("08:43")).filter((x) => x.state === "short")).toEqual([]);
    expect(tiles(planFor("08:00")).filter((x) => x.state === "short")).toEqual([]);
  });
  it("says a doable day whose departure has gone is gone, still washed out", () => {
    const t = tiles(planFor("08:00"));
    expect(t[0].state).toBe("gone");
    expect(t[0].best).toBe(false);
  });
  it("has no best day when every day is wet", () => {
    const rainy: WeatherForecast = { updated: "", steps: forecast.steps.map((s) => ({ ...s, rain: 0.5, symbol: "rain" })) };
    expect(tiles(planFor("08:00"), { forecast: { below: rainy, above: null } }).some((x) => x.best)).toBe(false);
  });
});
