import { describe, expect, it } from "vitest";
import { badDays, baseSymbol, betterDay, betterTime, skyKind, summarize, tripWeatherReport, weatherAt, weatherNotes, weatherWords } from "@/lib/weather";
import type { WeatherForecast } from "@/lib/weather";

const hourly = (h: number, temp: number, rain: number, symbol: string) => ({
  t: `2026-10-17T${String(h).padStart(2, "0")}:00:00Z`,
  temp,
  wind: 4,
  rain,
  hours: 1,
  symbol,
});

const forecast: WeatherForecast = {
  updated: "2026-10-16T12:00:00Z",
  steps: [
    hourly(7, 3.6, 0, "clearsky_day"),
    hourly(8, 5.2, 0, "fair_day"),
    hourly(9, 7.9, 0.4, "lightrainshowers_day"),
    hourly(10, 9.4, 0, "partlycloudy_day"),
    hourly(11, 10.1, 0, "cloudy"),
    { t: "2026-10-17T12:00:00Z", temp: 11, wind: 6, rain: 1.2, hours: 6, symbol: "rain" },
  ],
};

describe("summarize", () => {
  it("covers the hours of the walk and picks the worst weather", () => {
    const s = summarize(forecast, new Date("2026-10-17T08:00:00Z"), new Date("2026-10-17T11:30:00Z"))!;
    expect(s).toMatchObject({ tempMin: 5, tempMax: 10, symbol: "lightrainshowers" });
    expect(s.rainMm).toBe(0.4);
  });
  it("takes a share of a 6-hour step's rain", () => {
    const s = summarize(forecast, new Date("2026-10-17T12:00:00Z"), new Date("2026-10-17T15:00:00Z"))!;
    expect(s.rainMm).toBe(0.6);
  });
  it("ranks rain over light rain, and cloudy over partly cloudy", () => {
    const f = (a: string, b: string): WeatherForecast => ({ updated: "", steps: [hourly(8, 5, 0, a), hourly(9, 5, 0, b)] });
    const at = (x: WeatherForecast) => summarize(x, new Date("2026-10-17T08:00:00Z"), new Date("2026-10-17T10:00:00Z"))!.symbol;
    expect(at(f("lightrainshowers_day", "rainshowers_day"))).toBe("rainshowers");
    expect(at(f("lightsnow", "snow"))).toBe("snow");
    expect(at(f("partlycloudy_day", "cloudy"))).toBe("cloudy");
    expect(at(f("rain", "lightrainandthunder"))).toBe("lightrainandthunder");
  });
  it("leaves out a step that starts as the walk ends", () => {
    const s = summarize(forecast, new Date("2026-10-17T10:00:00Z"), new Date("2026-10-17T12:00:00Z"))!;
    expect(s.symbol).toBe("cloudy");
    expect(s.tempMax).toBe(10);
  });
  it("is null past the end of the forecast", () => {
    expect(summarize(forecast, new Date("2026-10-17T16:00:00Z"), new Date("2026-10-17T20:00:00Z"))).toBeNull();
  });
});

describe("words and warnings", () => {
  it("names the weather in Slovak", () => {
    expect(weatherWords(baseSymbol("lightrainshowers_day"))).toBe("slabý dážď (prehánky)");
    expect(weatherWords("clearsky")).toBe("jasno");
    expect(weatherWords("heavyrainandthunder")).toBe("búrky");
  });
  it("maps MET symbols to what the sun dial draws", () => {
    expect(skyKind("lightrainshowers_day")).toBe("lightrain");
    expect(skyKind("heavyrainandthunder")).toBe("thunder");
    expect(skyKind("partlycloudy_night")).toBe("partly");
    expect(skyKind("lightsleet")).toBe("sleet");
    expect(skyKind("cloudy")).toBe("cloudy");
    expect(skyKind(null)).toBeNull();
  });
  it("finds the step covering a moment", () => {
    expect(weatherAt(forecast, Date.parse("2026-10-17T09:30:00Z"))?.symbol).toBe("lightrainshowers_day");
    expect(weatherAt(forecast, Date.parse("2026-10-17T16:00:00Z"))?.symbol).toBe("rain");
    expect(weatherAt(forecast, Date.parse("2026-10-17T19:00:00Z"))).toBeNull();
  });
});

describe("weather notes", () => {
  const day = (rows: [number, string, number, number, number][]): WeatherForecast => ({
    updated: "",
    steps: rows.map(([h, symbol, rain, wind, temp]) => ({ ...hourly(h, temp, rain, symbol), wind })),
  });
  const from = new Date("2026-10-17T08:00:00Z");
  const to = new Date("2026-10-17T14:00:00Z");

  it("says nothing on a calm day", () => {
    const f = day([[8, "fair_day", 0, 3, 9], [10, "partlycloudy_day", 0, 4, 12], [12, "cloudy", 0, 5, 11], [13, "cloudy", 0, 5, 10]]);
    expect(weatherNotes(f, null, from, to)).toEqual([]);
  });
  it("warns about storms with their hours, and about wind and frost up top", () => {
    const below = day([[8, "fair_day", 0, 3, 9], [11, "rainandthunder", 5, 8, 12], [12, "heavyrainandthunder", 7, 9, 11], [13, "cloudy", 0, 5, 10]]);
    const top = day([[8, "fair_day", 0, 16, -1], [13, "cloudy", 0, 9, 1]]);
    const notes = weatherNotes(below, top, from, to);
    expect(notes.map((n) => n.strong)).toEqual([true, false, false]);
    expect(notes[0].text).toContain("Búrky");
    expect(notes.some((n) => n.text.startsWith("Silný dážď"))).toBe(false);
  });
  it("warns about heavy rain by amount even without a heavy symbol", () => {
    const f = day([[8, "rain", 4.5, 3, 9], [9, "rain", 1, 3, 9], [13, "cloudy", 0, 3, 9]]);
    expect(weatherNotes(f, null, from, to)[0]).toMatchObject({ strong: true });
  });
});

describe("trip weather report", () => {
  const at = (h: number) => new Date(`2026-10-17T${String(h).padStart(2, "0")}:00:00Z`);

  it("gives the whole temperature range and the one rainy hour", () => {
    const r = tripWeatherReport(forecast, null, at(7), at(11))!;
    expect(r.tempMin).toBe(4);
    expect(r.tempMax).toBe(9);
    expect(r.wet).toEqual({ when: `${hm(at(9))}–${hm(at(10))}`, mmPerHour: 0.4, snow: false, sleet: false });
  });

  it("reports nothing wet on a dry window and no hours for fine weather", () => {
    const r = tripWeatherReport(forecast, null, at(7), at(9))!;
    expect(r.wet).toBeNull();
    expect(r.worstWhen).toBeNull();
  });

  it("names the colder goal only when it is clearly colder", () => {
    const cold: WeatherForecast = { ...forecast, steps: forecast.steps.map((s) => ({ ...s, temp: s.temp - 8 })) };
    expect(tripWeatherReport(forecast, cold, at(7), at(11))!.topMin).toBe(-4);
    expect(tripWeatherReport(forecast, forecast, at(7), at(11))!.topMin).toBeNull();
  });

  it("has no report when the forecast does not reach the end of the window", () => {
    expect(tripWeatherReport(forecast, null, at(7), new Date("2026-10-17T19:00:00Z"))).toBeNull();
  });
});

function hm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

describe("better day", () => {
  // Six-hour steps from Friday 23 Oct to Tuesday 27 Oct (local time), rain all Saturday.
  const sixHourly = (symbolFor: (d: Date) => string): WeatherForecast => ({
    updated: "2026-10-22T12:00:00Z",
    steps: Array.from({ length: 4 * 5 }, (_, i) => {
      const t = new Date(2026, 9, 23, i * 6);
      const symbol = symbolFor(t);
      return { t: t.toISOString(), temp: 8, wind: 3, rain: symbol.includes("rain") ? 3 : 0, hours: 6, symbol };
    }),
  });
  const wetSaturday = sixHourly((t) => (t.getDate() === 24 ? "rain" : t.getDate() === 23 ? "cloudy" : "partlycloudy_day"));
  const sat = [new Date(2026, 9, 24, 9), new Date(2026, 9, 24, 13)] as const;

  it("suggests the next dry day at the same time, across the clock change", () => {
    const r = betterDay(wetSaturday, null, sat[0], sat[1], new Date(2026, 9, 24, 7))!;
    expect(r.offset).toBe(1);
    expect(r.summary.symbol).toBe("partlycloudy");
  });

  it("prefers an earlier day when it is still ahead and as near", () => {
    const r = betterDay(wetSaturday, null, sat[0], sat[1], new Date(2026, 9, 22, 20))!;
    expect(r.offset).toBe(1);
    const fridayOnly = sixHourly((t) => (t.getDate() === 23 ? "fair_day" : "rain"));
    expect(betterDay(fridayOnly, null, sat[0], sat[1], new Date(2026, 9, 22, 20))!.offset).toBe(-1);
  });

  it("says nothing on a dry day or when every day is wet", () => {
    expect(betterDay(wetSaturday, null, new Date(2026, 9, 25, 9), new Date(2026, 9, 25, 13), new Date(2026, 9, 24))).toBeNull();
    const allWet = sixHourly(() => "rain");
    expect(betterDay(allWet, null, sat[0], sat[1], new Date(2026, 9, 22))).toBeNull();
  });
});

describe("bad days", () => {
  const steps = (kind: (d: Date) => string): WeatherForecast => ({
    updated: "2026-10-22T12:00:00Z",
    steps: Array.from({ length: 4 * 4 }, (_, i) => {
      const t = new Date(2026, 9, 23, i * 6);
      return { t: t.toISOString(), temp: 2, wind: 3, rain: 0, hours: 6, symbol: kind(t) };
    }),
  });

  it("marks only rain, snow, fog and storm days, and nothing past the forecast", () => {
    const f = steps((t) => ({ 23: "fog", 24: "heavysnow", 25: "partlycloudy_day", 26: "rainandthunder" })[t.getDate()]!);
    const days = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-30"];
    expect(badDays(f, new Date(2026, 9, 24, 9), new Date(2026, 9, 24, 13), days)).toEqual({
      "2026-10-23": "fog",
      "2026-10-24": "snow",
      "2026-10-26": "thunder",
    });
  });
});

describe("better time", () => {
  // Rain 9:00-12:00 local on 24 Oct, dry otherwise.
  const day: WeatherForecast = {
    updated: "2026-10-23T12:00:00Z",
    steps: Array.from({ length: 24 }, (_, h) => {
      const t = new Date(2026, 9, 24, h);
      const wet = h >= 9 && h < 12;
      return { t: t.toISOString(), temp: 6, wind: 3, rain: wet ? 1 : 0, hours: 1, symbol: wet ? "rain" : "partlycloudy_day" };
    }),
  };
  const window = { earliest: new Date(2026, 9, 24, 7), latest: new Date(2026, 9, 24, 17) };

  it("finds the nearest dry start the same day", () => {
    const r = betterTime(day, null, new Date(2026, 9, 24, 10), new Date(2026, 9, 24, 12), window)!;
    expect(r.shiftMin).toBe(120);
    expect(r.summary.rainMm).toBe(0);
  });

  it("goes earlier when later would end after the window", () => {
    const late = { ...window, latest: new Date(2026, 9, 24, 13) };
    expect(betterTime(day, null, new Date(2026, 9, 24, 10), new Date(2026, 9, 24, 12), late)!.shiftMin).toBe(-180);
  });

  it("says nothing on a dry walk or when no time fits", () => {
    expect(betterTime(day, null, new Date(2026, 9, 24, 13), new Date(2026, 9, 24, 15), window)).toBeNull();
    const tight = { earliest: new Date(2026, 9, 24, 8), latest: new Date(2026, 9, 24, 13) };
    expect(betterTime(day, null, new Date(2026, 9, 24, 9), new Date(2026, 9, 24, 13), tight)).toBeNull();
  });
});
