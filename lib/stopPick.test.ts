import { describe, expect, it } from "vitest";
import { pickPosition, rankStops } from "@/lib/stopPick";
import type { RankableStop, StopRide } from "@/lib/stopPick";

// Stops at the trail (no walk), so the total is the ride.
const bus: RankableStop = { mode: "autobus", join: null, distance_m: 0 };
const train: RankableStop = { mode: "vlak", join: null, distance_m: 0 };
const ride = (rideMin: number, approx = false): StopRide => ({ rideMin, approx });

describe("rankStops", () => {
  it("puts the bus first when it is faster than the train", () => {
    const r = rankStops([train, bus], [ride(229), ride(65, true)]);
    expect(r.order).toEqual([1, 0]);
    expect(r.totals[1]?.totalMin).toBe(65);
  });

  it("puts the train first when it is much faster", () => {
    const r = rankStops([bus, train], [ride(180, true), ride(60)]);
    expect(r.order).toEqual([1, 0]);
  });

  it("prefers the bus on a tie and within 10 % of the train", () => {
    expect(rankStops([train, bus], [ride(60), ride(60, true)]).order[0]).toBe(1);
    expect(rankStops([train, bus], [ride(60), ride(65, true)]).order[0]).toBe(1);
    // 12 % slower: the train stays first.
    expect(rankStops([train, bus], [ride(60), ride(67, true)]).order[0]).toBe(0);
  });

  it("adds the walk from the stop to the total", () => {
    const far: RankableStop = { mode: "autobus", join: { walk_m: 2000 }, distance_m: 2000 };
    const r = rankStops([far, bus], [ride(40), ride(50)]);
    expect(r.totals[0]!.totalMin).toBeGreaterThan(40 + 20);
    expect(r.order).toEqual([1, 0]);
  });

  it("keeps the nearest-walk order without a start", () => {
    const r = rankStops([train, bus], null);
    expect(r.order).toEqual([0, 1]);
    expect(r.totals).toEqual([null, null]);
  });

  it("sends stops with an unknown ride last", () => {
    expect(rankStops([bus, train], [null, ride(60)]).order).toEqual([1, 0]);
  });
});

describe("pickPosition", () => {
  it("keeps the saved pick wherever it ranks", () => {
    const r = rankStops([train, bus], [ride(229), ride(65, true)]);
    expect(pickPosition(r.order, 0)).toBe(1);
    expect(pickPosition(r.order, 1)).toBe(0);
  });

  it("takes the default with no saved pick or a pick that no longer exists", () => {
    expect(pickPosition([1, 0], null)).toBe(0);
    expect(pickPosition([1, 0], 7)).toBe(0);
  });
});
