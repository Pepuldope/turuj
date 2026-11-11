import { describe, expect, it } from "vitest";
import { departureFor, hourStrip, rainFill, startHourIndex } from "@/lib/hourStrip";
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

describe("rainFill", () => {
  it("shows a sliver for light rain and fills at 2 mm an hour", () => {
    expect(rainFill(0)).toBe(0);
    expect(rainFill(0.1)).toBe(0.12);
    expect(rainFill(1)).toBe(0.5);
    expect(rainFill(5)).toBe(1);
  });
});
