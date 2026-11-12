import { describe, expect, it } from "vitest";
import { hourStrip, badHoursInSpan, badLevel, snapTime } from "@/lib/hourStrip";
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
});

describe("slider helpers", () => {
  it("snaps to 15 minutes", () => {
    expect(clock(snapTime(at(8, 7).getTime()))).toBe("08:00");
    expect(clock(snapTime(at(8, 8).getTime()))).toBe("08:15");
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
