import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { haversineM } from "@/lib/geo";
import { nearestMainTrips, roundKm } from "@/lib/nearbyTrips";
import type { TripIndex } from "@/lib/tripSchema";

const index = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "trips", "index.json"), "utf8")) as TripIndex;
const mains = index.trips.filter((t) => !t.variant_of);

describe("nearest trips", () => {
  it("match a scan of every trip, nearest first, never the place itself", () => {
    for (const t of [mains[0], mains[500], mains[1500], mains[mains.length - 1]]) {
      const got = nearestMainTrips(mains, t.destination.location, t.slug, 7);
      const want = mains
        .filter((o) => o.slug !== t.slug)
        .map((o) => ({ slug: o.slug, m: haversineM(t.destination.location, o.destination.location) }))
        .sort((a, b) => a.m - b.m)
        .slice(0, 7);
      expect(got.map((g) => g.trip.slug)).toEqual(want.map((w) => w.slug));
      expect(got.some((g) => g.trip.slug === t.slug)).toBe(false);
    }
  });

  it("gives fewer than asked only when the data is small", () => {
    expect(nearestMainTrips(mains.slice(0, 3), mains[0].destination.location, mains[0].slug, 7)).toHaveLength(2);
  });

  it("rounds kilometres, one at least", () => {
    expect(roundKm(300)).toBe(1);
    expect(roundKm(6400)).toBe(6);
  });
});
