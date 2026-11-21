import { describe, expect, it } from "vitest";
import { fitsHoliday, holidayLeaveBy, holidayShown, holidaySunset, holidayYear } from "@/lib/holidayBlock";
import type { HolidayCandidate } from "@/lib/holidayBlock";

const BRATISLAVA = { lat: 48.1486, lon: 17.1077 };
const ok: HolidayCandidate = { kids: true, kind: "vrchol", carMin: 10, walkMin: 75, maxEleM: 439, hasClosure: false };

describe("holiday block", () => {
  it("is shown from late November to 7 January", () => {
    expect(["11-20", "12-01", "12-24", "12-31", "01-01", "01-07"].map(holidayShown)).toEqual([true, true, true, true, true, true]);
    expect(["11-19", "01-08", "03-15", "07-01"].map(holidayShown)).toEqual([false, false, false, false]);
  });

  it("counts for the December the holidays start in", () => {
    expect(holidayYear({ y: 2026, mo: 11 })).toBe(2026);
    expect(holidayYear({ y: 2026, mo: 12 })).toBe(2026);
    expect(holidayYear({ y: 2027, mo: 1 })).toBe(2026);
  });

  it("knows the sunset in Bratislava on 24 December", () => {
    expect(holidaySunset(2026, BRATISLAVA)).toBe("16:01");
  });

  it("leaves half an hour of light after the walk, at kids' pace", () => {
    // Sunset 16:01, 30 min spare, 75 min x 1.3 = 100 min walk (to 5 min), 10 min drive: 13:41, on the 5 min before.
    expect(holidayLeaveBy(2026, BRATISLAVA, 10, 75)).toBe("13:40");
    // A longer drive only moves the time earlier.
    expect(holidayLeaveBy(2026, BRATISLAVA, 40, 75)).toBe("13:10");
  });

  it("picks short, low trips for kids with no closure rule", () => {
    expect(fitsHoliday(ok)).toBe(true);
    expect(fitsHoliday({ ...ok, maxEleM: null })).toBe(true);
    expect(fitsHoliday({ ...ok, kids: false })).toBe(false);
    expect(fitsHoliday({ ...ok, walkMin: 105 })).toBe(false);
    expect(fitsHoliday({ ...ok, carMin: 50 })).toBe(false);
    expect(fitsHoliday({ ...ok, maxEleM: 1200 })).toBe(false);
    expect(fitsHoliday({ ...ok, kind: "roklina" })).toBe(false);
    expect(fitsHoliday({ ...ok, hasClosure: true })).toBe(false);
  });
});
