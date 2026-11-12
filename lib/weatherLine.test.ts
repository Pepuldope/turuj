import { describe, expect, it } from "vitest";
import { weatherLine } from "@/lib/weatherLine";
import type { WeatherForecast } from "@/lib/weather";
import { zonedDate } from "@/lib/zoned";

const at = (h: number) => zonedDate(2026, 12, 12, h, 0);
const day = (f: (h: number) => { symbol: string; temp: number; rain?: number }): WeatherForecast => ({
  updated: "",
  steps: Array.from({ length: 24 }, (_, h) => {
    const s = f(h);
    return { t: at(h).toISOString(), temp: s.temp, wind: 2, rain: s.rain ?? 0, hours: 1, symbol: s.symbol };
  }),
});

describe("weatherLine", () => {
  it("is one quiet line when the weather is fine", () => {
    const l = weatherLine(day(() => ({ symbol: "partlycloudy_day", temp: 2 })), null, at(9), at(15))!;
    expect(l.tone).toBe("fine");
    expect(l.text).toBe("polojasno, 2 °C");
    expect(l.sky).toBe("partly");
  });
  it("says wet weather from the start as 'do' and adds the frost up at the goal", () => {
    const below = day((h) => (h < 10 ? { symbol: "sleet", temp: 1, rain: 0.4 } : { symbol: "cloudy", temp: 1 }));
    const above = day(() => ({ symbol: "cloudy", temp: -4 }));
    const l = weatherLine(below, above, at(8), at(14))!;
    expect(l.tone).toBe("warn");
    expect(l.text).toBe("dážď so snehom do 10:00, na vrchole −4 °C");
  });
  it("says rain that comes later as 'od'", () => {
    const below = day((h) => (h >= 12 ? { symbol: "rain", temp: 8, rain: 0.6 } : { symbol: "cloudy", temp: 8 }));
    expect(weatherLine(below, null, at(9), at(15))!.text).toBe("dážď od 12:00");
  });
  it("makes a storm the danger line, in the note's own words", () => {
    const below = day((h) => (h >= 13 ? { symbol: "rainandthunder", temp: 15, rain: 2 } : { symbol: "cloudy", temp: 15 }));
    const l = weatherLine(below, null, at(9), at(16))!;
    expect(l.tone).toBe("danger");
    expect(l.text).toContain("Búrky");
  });
  it("is null when the forecast doesn't cover the walk", () => {
    expect(weatherLine(day(() => ({ symbol: "cloudy", temp: 5 })), null, at(20), zonedDate(2026, 12, 13, 3, 0))).toBeNull();
  });
});
