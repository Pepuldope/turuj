import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sunLocation, trailDetailFrom } from "@/lib/data";
import { monthTable } from "@/lib/tripAnswers";
import { onRouteTeaser, pickRoutePlaces } from "@/lib/tripOnRoute";
import { answerRows } from "@/lib/tripRows";
import type { TripDetail } from "@/lib/tripSchema";

const DIR = join(__dirname, "..", "public", "data", "trips");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "list.json").sort();
const sample = [...files.filter((_, i) => i % 120 === 0), "chopok.json", "krivan.json", "abrazna.json", "biela-jaskyna-pri-starej-horarni.json", "gacovska-skala-zejmarska-roklina-ustie.json"];

describe("question rows", () => {
  it("are five to eight on every sampled trip, with or without 'O výlete'", () => {
    expect(sample.length).toBeGreaterThan(40);
    for (const f of sample) {
      const trip = JSON.parse(readFileSync(join(DIR, f), "utf8")) as TripDetail;
      const d = trailDetailFrom(trip);
      const sun = sunLocation(d);
      const months = sun ? monthTable(sun, trip.duration_min, d.closures, "2026-11-14") : [];
      const base = { hasPlaces: !!onRouteTeaser("sk", pickRoutePlaces(d.pois)), hasParking: d.parkingLots.length > 0, hasStops: d.transitStops.length > 0, hasMonths: months.length > 0 };
      for (const hasAbout of [false, true]) {
        const n = answerRows({ ...base, hasAbout }).length;
        expect(n, `${f} about=${hasAbout}`).toBeGreaterThanOrEqual(5);
        expect(n, `${f} about=${hasAbout}`).toBeLessThanOrEqual(8);
      }
      expect(months.length, f).toBe(12);
    }
  });
});
