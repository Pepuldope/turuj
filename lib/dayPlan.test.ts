import { describe, expect, it } from "vitest";
import { outsideDaylight, approachMin, atDayMinute, COMFORT_MARGIN_MIN, hikeMinutes, planDay, SAFE_MARGIN_MIN } from "./dayPlan";

const BRATISLAVA = { lat: 48.1486, lon: 17.1077 };
const MIN = 60000;

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

describe("planDay", () => {
  it("lays out drive there, hike, drive back back-to-back", () => {
    const p = planDay({ date: "2026-06-21", start: "08:00", driveMin: 45, hikeMin: 180, location: BRATISLAVA })!;
    expect(p.segments.map((s) => s.kind)).toEqual(["drive-there", "hike", "drive-back"]);
    expect(hhmm(p.segments[0].start)).toBe("08:00");
    expect(hhmm(p.hikeStart)).toBe("08:45");
    expect(hhmm(p.hikeEnd)).toBe("11:45");
    expect(hhmm(p.segments[2].end)).toBe("12:30");
    expect(p.verdict).toBe("ok");
  });

  it("without a known drive, the start time is the hike start and there is only one segment", () => {
    const p = planDay({ date: "2026-06-21", start: "09:00", driveMin: null, hikeMin: 120, location: BRATISLAVA })!;
    expect(p.segments.map((s) => s.kind)).toEqual(["hike"]);
    expect(hhmm(p.hikeStart)).toBe("09:00");
  });

  it("latest start ends the hike 30 min before sunset (drive back is allowed in the dark)", () => {
    const input = { date: "2026-12-21", start: "09:00", driveMin: 60, hikeMin: 240, location: BRATISLAVA };
    const p = planDay(input)!;
    expect(p.latestStart.getTime() + (60 + 240 + SAFE_MARGIN_MIN) * MIN).toBe(p.sunset.getTime());

    // Leaving at the latest start (minute rounded down) is fine with a light note; a few minutes later is "tight".
    const atLatest = planDay({ ...input, start: hhmm(p.latestStart) })!;
    expect(atLatest.verdict).toBe("close");
    const late = new Date(p.latestStart.getTime() + 5 * MIN);
    expect(planDay({ ...input, start: hhmm(late) })!.verdict).toBe("tight");
  });

  it("kids walk 1.3x slower, rounded to 5 min", () => {
    expect(hikeMinutes(120, false)).toBe(120);
    expect(hikeMinutes(120, true)).toBe(155);
    expect(hikeMinutes(100, true)).toBe(130);
  });

  it("grades the finish: ok, close, tight, after sunset, after dusk", () => {
    const base = { date: "2026-10-10", driveMin: 0, hikeMin: 60, location: BRATISLAVA };
    const ref = planDay({ ...base, start: "09:00" })!;
    const startAt = (minutesBeforeSunset: number) =>
      hhmm(new Date(ref.sunset.getTime() - (60 + minutesBeforeSunset) * MIN));

    expect(planDay({ ...base, start: startAt(COMFORT_MARGIN_MIN + 10) })!.verdict).toBe("ok");
    expect(planDay({ ...base, start: startAt(SAFE_MARGIN_MIN + 10) })!.verdict).toBe("close");
    expect(planDay({ ...base, start: startAt(10) })!.verdict).toBe("tight");
    expect(planDay({ ...base, start: startAt(-5) })!.verdict).toBe("after-sunset");
    expect(planDay({ ...base, start: startAt(-90) })!.verdict).toBe("after-dusk");
  });

  it("civil dusk comes 25-50 min after sunset in Slovakia", () => {
    for (const date of ["2026-03-20", "2026-06-21", "2026-12-21"]) {
      const p = planDay({ date, start: "09:00", driveMin: 0, hikeMin: 60, location: BRATISLAVA })!;
      const gap = (p.dusk.getTime() - p.sunset.getTime()) / MIN;
      expect(gap).toBeGreaterThan(25);
      expect(gap).toBeLessThan(50);
    }
  });

  it("flags a hike that starts before sunrise", () => {
    const p = planDay({ date: "2026-12-21", start: "05:30", driveMin: 30, hikeMin: 120, location: BRATISLAVA })!;
    expect(p.startsInDark).toBe(true);
  });

  // Train times are minutes after midnight on the wall clock; the clocks change on these days.
  for (const date of ["2026-10-25", "2026-03-29"]) {
    it(`keeps train times on the wall clock when the clocks change (${date})`, () => {
      const fixed = { there: { leave: 600, arrive: 780 }, back: { leave: 1080, home: 1140 } };
      const p = planDay({ date, start: "10:00", driveMin: null, hikeMin: 240, location: BRATISLAVA, fixed })!;
      expect(hhmm(p.segments[0].start)).toBe("10:00");
      expect(hhmm(p.hikeStart)).toBe("13:00");
      expect(hhmm(p.hikeEnd)).toBe("17:00");
      expect(hhmm(p.segments[2].end)).toBe("19:00");
    });
  }

  it("a train arriving 13:00 on 25 Oct with a 4 h hike ends after the 16:4x sunset", () => {
    const fixed = { there: { leave: 600, arrive: 780 }, back: null };
    const p = planDay({ date: "2026-10-25", start: "10:00", driveMin: null, hikeMin: 240, location: BRATISLAVA, fixed })!;
    expect(hhmm(p.sunset).startsWith("16:")).toBe(true);
    expect(p.hikeEnd > p.sunset).toBe(true);
    expect(["after-sunset", "after-dusk"]).toContain(p.verdict);
  });

  it("with no train back that day, the day ends at the station: no made-up way home", () => {
    const fixed = { there: { leave: 480, arrive: 600 }, back: null };
    const p = planDay({ date: "2026-10-25", start: "08:00", driveMin: null, hikeMin: 180, location: BRATISLAVA, fixed })!;
    expect(p.segments.map((s) => s.kind)).toEqual(["drive-there", "hike"]);
  });

  it("atDayMinute reads minutes as wall-clock time, also past midnight", () => {
    expect(hhmm(atDayMinute("2026-10-25", 13 * 60 + 5))).toBe("13:05");
    expect(hhmm(atDayMinute("2026-03-29", 2))).toBe("00:02");
    const late = atDayMinute("2026-10-25", 24 * 60 + 30);
    expect([late.getDate(), hhmm(late)]).toEqual([26, "00:30"]);
  });

  it("rejects malformed input", () => {
    expect(planDay({ date: "", start: "09:00", driveMin: 0, hikeMin: 60, location: BRATISLAVA })).toBeNull();
    expect(planDay({ date: "2026-06-21", start: "", driveMin: 0, hikeMin: 60, location: BRATISLAVA })).toBeNull();
  });
});

describe("approachMin", () => {
  it("ignores a short step from the car", () => {
    expect(approachMin(0)).toBe(0);
    expect(approachMin(149)).toBe(0);
  });
  it("rounds the walk to the trail up to 5 minutes", () => {
    expect(approachMin(200)).toBe(5);
    expect(approachMin(627)).toBe(15);
  });
});

describe("outsideDaylight", () => {
  const sunset = new Date(2026, 9, 10, 17, 0);
  const at = (h: number) => new Date(2026, 9, 10, h, 0);
  it("is late when the hike ends after sunset, even if it also started in the dark", () => {
    expect(outsideDaylight({ hikeEnd: at(18), sunset, startsInDark: false })).toBe("late");
    expect(outsideDaylight({ hikeEnd: at(18), sunset, startsInDark: true })).toBe("late");
  });
  it("is early when only the start is before sunrise", () => {
    expect(outsideDaylight({ hikeEnd: at(14), sunset, startsInDark: true })).toBe("early");
  });
  it("is null inside daylight", () => {
    expect(outsideDaylight({ hikeEnd: at(14), sunset, startsInDark: false })).toBeNull();
  });
});
