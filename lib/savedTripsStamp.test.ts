import { describe, expect, it } from "vitest";
import { planAt, stampPatch, stampSave } from "@/lib/savedTrips";
import type { SavedTrip } from "@/lib/savedTrips";

const trip = (extra: Partial<SavedTrip> = {}): SavedTrip => ({
  slug: "rysy",
  name: "Rysy",
  date: "2026-08-01",
  time: "08:00",
  start: null,
  driveMin: null,
  hikeMin: 300,
  sun: { lat: 49.1, lon: 20.1 },
  savedAt: "2026-07-01T10:00:00.000Z",
  offline: "ok",
  ...extra,
});

describe("planAt", () => {
  it("uses changedAt when there is one, else savedAt, else 1", () => {
    expect(planAt(trip({ changedAt: 42 }))).toBe(42);
    expect(planAt(trip())).toBe(Date.parse("2026-07-01T10:00:00.000Z"));
    expect(planAt(trip({ savedAt: "garbage" }))).toBe(1);
  });
});

describe("stampSave", () => {
  it("stamps the clock for a new trip", () => {
    expect(stampSave(trip(), undefined, 5000).changedAt).toBe(5000);
  });
  it("stays newer than the copy it replaces when the clock went backwards", () => {
    const prev = trip({ changedAt: 9000 });
    expect(stampSave(trip(), prev, 5000).changedAt).toBe(9001);
  });
});

describe("stampPatch", () => {
  const base = trip({ changedAt: 1000, weather: undefined });
  it("never moves changedAt for offline, eve or weather", () => {
    expect(stampPatch(base, { offline: "failed" }, 9000).changedAt).toBe(1000);
    expect(stampPatch(base, { eve: true }, 9000).changedAt).toBe(1000);
    expect(stampPatch(base, { weather: { url: "u", topUrl: null, below: null, above: null, at: null } }, 9000).changedAt).toBe(1000);
  });
  it("moves changedAt for a date or doneAt change", () => {
    expect(stampPatch(base, { date: "2026-08-02" }, 9000)).toMatchObject({ date: "2026-08-02", changedAt: 9000 });
    expect(stampPatch(base, { doneAt: "2026-08-02T10:00:00.000Z" }, 9000).changedAt).toBe(9000);
  });
  it("leaves changedAt when the value is the same", () => {
    expect(stampPatch(base, { date: "2026-08-01" }, 9000).changedAt).toBe(1000);
    expect(stampPatch(base, { doneAt: undefined }, 9000).changedAt).toBe(1000);
  });
  it("applies the max rule with a clock that went backwards", () => {
    expect(stampPatch(base, { date: "2026-08-02" }, 500).changedAt).toBe(1001);
  });
});
