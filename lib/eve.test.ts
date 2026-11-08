import { describe, expect, it } from "vitest";
import { closedUntilFor, eveAtFor, eveMessage, eveWanted } from "./eve";
import type { EveJob } from "./eve";
import type { WeatherForecast } from "./weather";
import { clock, zonedDate } from "./zoned";

const from = zonedDate(2026, 11, 8, 8, 0).getTime();
const to = zonedDate(2026, 11, 8, 14, 0).getTime();
const job: EveJob = { name: "Sitno", slug: "sitno", lang: "sk", lat: 48.4, lon: 18.9, from, to, leave: zonedDate(2026, 11, 8, 9, 30).getTime(), closedUntil: [] };

const forecast = (symbol: string, temp = 12): WeatherForecast => ({
  updated: "",
  steps: Array.from({ length: 8 }, (_, i) => ({ t: new Date(from - 3600_000 + i * 3600_000).toISOString(), temp, wind: 3, rain: 0, hours: 1, symbol })),
});

describe("evening reminder timing", () => {
  it("is 19:00 Slovak time the evening before", () => {
    const at = eveAtFor("2026-11-08")!;
    expect(clock(at)).toBe("19:00");
    expect(new Date(at).toISOString()).toBe("2026-11-07T18:00:00.000Z");
    expect(clock(eveAtFor("2026-07-08")!)).toBe("19:00");
    expect(eveAtFor("nonsense")).toBeNull();
  });

  it("is wanted for tomorrow before 19:00, not after, not today, not beyond 8 days", () => {
    const day = (h: number, d = 7) => zonedDate(2026, 11, d, h, 0).getTime();
    expect(eveWanted("2026-11-08", day(10))).toBe(eveAtFor("2026-11-08"));
    expect(eveWanted("2026-11-08", day(19, 7) + 60_000)).toBeNull();
    expect(eveWanted("2026-11-08", day(10, 8))).toBeNull();
    expect(eveWanted("2026-11-15", day(10))).not.toBeNull();
    expect(eveWanted("2026-11-17", day(10))).toBeNull();
  });
});

describe("evening reminder text", () => {
  it("names the trip, the weather and the leave-by time", () => {
    const m = eveMessage(job, forecast("partlycloudy_day"));
    expect(m.title).toBe("Zajtra: Sitno");
    expect(m.body).toContain("Polojasno, 12 °C.");
    expect(m.body).toContain("Vyrazte najneskôr o 9:30.");
    expect(m.url).toBe("/trasa/sitno");
    expect(m.body).not.toMatch(/!|otvoren/i);
  });

  it("warns about a storm with its time and offers another trip", () => {
    const f = forecast("clearsky_day");
    f.steps[5].symbol = "heavyrainandthunder";
    const m = eveMessage(job, f);
    expect(m.body).toContain("búrky okolo 12:00");
    expect(m.body).toContain("Ak bude pršať, pozrite si iný výlet v okolí.");
  });

  it("states a known closure with its end date, and says nothing about closures without data", () => {
    expect(eveMessage({ ...job, closedUntil: ["2026-11-30"] }, null).body).toContain("Pozor: trasa je zatvorená do 30. 11. 2026.");
    expect(eveMessage(job, forecast("fair_day")).body).not.toMatch(/zatvoren|otvoren/);
  });

  it("leaves out what it does not know", () => {
    const m = eveMessage({ ...job, leave: null }, null);
    expect(m.body).toBe("Pozrite si plán a počasie na stránke výletu.");
  });

  it("speaks English under /en", () => {
    const m = eveMessage({ ...job, lang: "en" }, forecast("fair_day"));
    expect(m.title).toBe("Tomorrow: Sitno");
    expect(m.url).toBe("/en/trasa/sitno");
    expect(m.body).toContain("Leave by 9:30 at the latest.");
  });
});

describe("closures covering the day", () => {
  it("keeps only rules that cover it", () => {
    const rules = [
      { starts_on: "2026-11-01", ends_on: "2027-05-31" },
      { starts_on: "2026-06-01", ends_on: "2026-06-30" },
    ];
    expect(closedUntilFor("2026-11-08", rules)).toEqual(["2027-05-31"]);
  });
});
