import { describe, expect, it } from "vitest";
import { departureFor, hourStrip, badHoursInSpan, badLevel, clampStart, isDarkHour, rainStrength, snapTime, startHourIndex, timeFraction, worstWalkKind } from "@/lib/hourStrip";
import type { WeatherForecast } from "@/lib/weather";
import { clock, zonedDate } from "@/lib/zoned";

const at = (h: number, m = 0) => zonedDate(2026, 7, 15, h, m);
const forecast: WeatherForecast = {
  updated: "",
  steps: Array.from({ length: 24 }, (_, h) => ({
    t: at(h).toISOString(),
    temp: 10 + h / 2,
    wind: 2,
    rain: h === 13 ? 1 : 0,
    hours: 1,
    symbol: h === 13 ? "rain" : "clearsky_day",
  })),
};

describe("hourStrip", () => {
  const cells = hourStrip(forecast, { from: at(6, 20), to: at(15, 10) }, at(7, 40), at(8, 30), at(12, 50), at(14, 10));
  it("runs over the range given, whole hours", () => {
    expect(clock(cells[0].t)).toBe("06:00");
    expect(clock(cells[cells.length - 1].t)).toBe("15:00");
  });
  it("marks the walk, the way and the spare hours", () => {
    const part = (h: string) => cells.find((c) => clock(c.t) === h)!.part;
    expect(part("06:00")).toBe("around");
    expect(part("07:00")).toBe("around"); // its middle, 07:30, is before leaving
    expect(part("08:00")).toBe("walk");
    expect(part("09:00")).toBe("walk");
    expect(part("13:00")).toBe("way");
    expect(part("15:00")).toBe("around");
  });
  it("carries the forecast of each hour", () => {
    const c = cells.find((x) => clock(x.t) === "13:00")!;
    expect(c.kind).toBe("rain");
    expect(c.rain).toBe(1);
    expect(c.temp).toBe(17);
  });
  it("finds the hour the walk starts in", () => {
    expect(clock(cells[startHourIndex(cells, at(8, 40))].t)).toBe("09:00");
    expect(clock(cells[startHourIndex(cells, at(8, 20))].t)).toBe("08:00");
  });
});

describe("departureFor", () => {
  it("leaves earlier by the ride, to 5 minutes", () => {
    expect(departureFor(at(10).getTime(), 47 * 60000)).toBe("09:15");
    expect(departureFor(at(10).getTime(), 0)).toBe("10:00");
  });
});

describe("isDarkHour", () => {
  it("is dark when the hour's middle is before sunrise or after sunset", () => {
    const rise = at(5, 40);
    const set = at(20, 10);
    expect(isDarkHour(at(5).getTime(), rise, set)).toBe(true); // middle 05:30
    expect(isDarkHour(at(6).getTime(), rise, set)).toBe(false);
    expect(isDarkHour(at(19).getTime(), rise, set)).toBe(false); // middle 19:30
    expect(isDarkHour(at(20).getTime(), rise, set)).toBe(true); // middle 20:30 is after 20:10
  });
});

describe("rainStrength", () => {
  it("has three strengths and none", () => {
    expect(rainStrength(0)).toBe(0);
    expect(rainStrength(0.1)).toBe(1);
    expect(rainStrength(0.5)).toBe(2);
    expect(rainStrength(1.9)).toBe(2);
    expect(rainStrength(2)).toBe(3);
  });
});

describe("worstWalkKind", () => {
  const cells = hourStrip(forecast, { from: at(6, 20), to: at(15, 10) }, at(7, 40), at(8, 30), at(12, 50), at(14, 10));
  it("picks the worst sky of the walk only", () => {
    expect(worstWalkKind(cells)).toBe("clear");
    const wet = hourStrip(forecast, { from: at(6, 20), to: at(15, 10) }, at(7, 40), at(8, 30), at(14, 10), at(15, 0));
    expect(worstWalkKind(wet)).toBe("rain");
  });
});

describe("slider helpers", () => {
  it("turns a time into a fraction of the range", () => {
    expect(timeFraction(at(9).getTime(), at(6).getTime(), at(18).getTime())).toBe(0.25);
  });
  it("snaps to 15 minutes", () => {
    expect(clock(snapTime(at(8, 7).getTime()))).toBe("08:00");
    expect(clock(snapTime(at(8, 8).getTime()))).toBe("08:15");
  });
  it("keeps the walk inside the range", () => {
    const len = 4 * 3600000;
    expect(clampStart(at(5).getTime(), len, at(6).getTime(), at(18).getTime())).toBe(at(6).getTime());
    expect(clampStart(at(16).getTime(), len, at(6).getTime(), at(18).getTime())).toBe(at(14).getTime());
    expect(clampStart(at(10).getTime(), len, at(6).getTime(), at(18).getTime())).toBe(at(10).getTime());
  });
  it("finds the bad hours the walk touches, and no others", () => {
    const cells = hourStrip(forecast, { from: at(11, 0), to: at(15, 0) }, at(11), at(11), at(11), at(11));
    expect(badLevel(cells.find((c) => clock(c.t) === "13:00")!)).toBe("warn");
    const inWalk = badHoursInSpan(cells, at(12).getTime(), at(14).getTime());
    expect(cells.map((c, i) => (inWalk[i] ? clock(c.t) : null)).filter(Boolean)).toEqual(["13:00"]);
    expect(badHoursInSpan(cells, at(8).getTime(), at(12).getTime()).every((x) => x === null)).toBe(true);
  });
  it("calls a storm or 2 mm an hour danger", () => {
    const c = { t: 0, temp: 5, kind: "thunder", symbol: "heavyrainandthunder", rain: 0, part: "walk" } as const;
    expect(badLevel(c)).toBe("danger");
    expect(badLevel({ ...c, kind: "rain", rain: 2 })).toBe("danger");
    expect(badLevel({ ...c, kind: "cloudy", rain: 0 })).toBeNull();
  });
});
