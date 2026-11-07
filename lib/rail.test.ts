import { describe, expect, it } from "vitest";
import { dayIndex, journeys, stationsNear, timetableChangeDay } from "@/lib/rail";
import type { RailTimetable } from "@/lib/rail";

const T = (h: number, m: number) => h * 60 + m;
// A (city) -> B (junction) by fast train, B -> C (village by the trail) by a local; one direct slow train A -> C.
const tt: RailTimetable = {
  days: ["20261017", "20261018"],
  agencies: ["ZSSK"],
  stations: [
    ["A", 48.15, 17.1],
    ["B", 49.22, 18.74],
    ["C", 49.17, 18.86],
  ],
  services: ["11", "10"],
  trips: [
    ["R 1", "Kriváň", 0, 0, [0, T(7, 0), T(7, 0), 1, T(9, 0), T(9, 0)]],
    ["Os 2", "", 0, 0, [1, T(9, 2), T(9, 2), 2, T(9, 15), T(9, 15)]], // too tight a change after R 1
    ["Os 3", "", 0, 0, [1, T(9, 10), T(9, 10), 2, T(9, 25), T(9, 25)]],
    ["Os 4", "", 0, 1, [0, T(6, 30), T(6, 30), 2, T(10, 30), T(10, 30)]], // Saturdays only
    ["R 5", "", 0, 0, [0, T(8, 0), T(8, 0), 1, T(10, 0), T(10, 0)]],
    ["Os 6", "", 0, 0, [1, T(10, 10), T(10, 10), 2, T(10, 25), T(10, 25)]],
  ],
};

describe("rail", () => {
  it("finds stations near a point", () => {
    expect(stationsNear(tt, { lat: 49.171, lon: 18.861 }, 2000).map((s) => s.name)).toEqual(["C"]);
    expect(dayIndex(tt, "2026-10-18")).toBe(1);
    expect(dayIndex(tt, "2026-12-30")).toBe(-1);
  });

  it("changes trains with time to spare and lists later connections", () => {
    const js = journeys(tt, 0, [{ station: 0, accessMin: 15 }], [{ station: 2, extraMin: 5 }], T(6, 40));
    expect(js.map((j) => j.legs.map((l) => l.train))).toEqual([["R 1 Kriváň", "Os 3"], ["R 5", "Os 6"]]);
    expect(js[0].dep).toBe(T(7, 0));
    expect(js[0].arr).toBe(T(9, 25));
    expect(js[0].legs[1].from).toBe("B");
  });

  it("only uses trains that run that day", () => {
    const sat = journeys(tt, 0, [{ station: 0, accessMin: 0 }], [{ station: 2, extraMin: 0 }], T(6, 0), 1);
    expect(sat[0].legs.map((l) => l.train)).toEqual(["R 1 Kriváň", "Os 3"]); // arrives 9:25, before the direct 10:30
    const sun = journeys(tt, 1, [{ station: 0, accessMin: 0 }], [{ station: 2, extraMin: 0 }], T(9, 30));
    expect(sun).toEqual([]);
  });
});

describe("timetableChangeDay", () => {
  const tt = { days: ["20261102", "20261212"], feed_end: "20261212" };
  it("is null on or before the last valid day", () => {
    expect(timetableChangeDay(tt, "2026-12-12")).toBeNull();
    expect(timetableChangeDay(tt, "2026-11-20")).toBeNull();
  });
  it("names the day after the feed ends when the trip day is later", () => {
    expect(timetableChangeDay(tt, "2026-12-13")).toBe("13. 12.");
    expect(timetableChangeDay(tt, "2027-03-01")).toBe("13. 12.");
  });
  it("falls back to the last listed day and rolls over the year end", () => {
    expect(timetableChangeDay({ days: ["20261231"] }, "2027-01-05")).toBe("1. 1.");
  });
});
