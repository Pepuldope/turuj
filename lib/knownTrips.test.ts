import { describe, expect, it } from "vitest";
import { KNOWN_RANK, MIN_SHOWN, STRIP_MAX, knownTitle, pickKnown } from "@/lib/knownTrips";
import type { KnownCandidate } from "@/lib/knownTrips";

const trip = (o: Partial<KnownCandidate> & { id: string }): KnownCandidate & { id: string } => ({
  rank: 90,
  hikeMin: 120,
  driveMin: 30,
  fits: true,
  viaLonger: false,
  ...o,
});

describe("pickKnown", () => {
  it("takes only well-known trips that fit the day", () => {
    const got = pickKnown(
      [trip({ id: "a" }), trip({ id: "low", rank: KNOWN_RANK - 1 }), trip({ id: "late", fits: false }), trip({ id: "via", viaLonger: true })],
      6,
      false
    );
    expect(got.map((t) => t.id)).toEqual(["a"]);
  });

  it("in November keeps to short walks", () => {
    const got = pickKnown([trip({ id: "short", hikeMin: 240 }), trip({ id: "long", hikeMin: 241 })], 11, false);
    expect(got.map((t) => t.id)).toEqual(["short"]);
    expect(pickKnown([trip({ id: "long", hikeMin: 500 })], 7, false)).toHaveLength(1);
  });

  it("without a start, best known first, at most STRIP_MAX", () => {
    const many = Array.from({ length: 12 }, (_, i) => trip({ id: `t${i}`, rank: 71 + i }));
    const got = pickKnown(many, 7, false);
    expect(got).toHaveLength(STRIP_MAX);
    expect(got[0].id).toBe("t11");
  });

  it("with a start, trips within reach, better known a little ahead of nearer ones", () => {
    const got = pickKnown(
      [
        trip({ id: "near", rank: 75, driveMin: 10 }),
        trip({ id: "famous", rank: 100, driveMin: 60 }),
        trip({ id: "far", rank: 100, driveMin: 120 }),
        trip({ id: "mid", rank: 80, driveMin: 40 }),
        trip({ id: "none", driveMin: null }),
      ],
      7,
      true
    );
    // famous 100-18=82, near 75-3=72, mid 80-12=68; far is beyond 90 min while 3 are within.
    expect(got.map((t) => t.id)).toEqual(["famous", "near", "mid"]);
  });

  it("widens the reach when too few are near", () => {
    const got = pickKnown([trip({ id: "a", driveMin: 100 }), trip({ id: "b", driveMin: 140 }), trip({ id: "c", driveMin: 20 })], 7, true);
    expect(got.length).toBeGreaterThanOrEqual(MIN_SHOWN);
  });
});

describe("knownTitle", () => {
  it("says what the month's picks share", () => {
    expect(knownTitle(11, "sk")).toBe("Známe výlety na november: krátke, späť za svetla");
    expect(knownTitle(11, "en")).toBe("Well-known trips for November: short, back before dark");
    expect(knownTitle(3, "sk")).toBe("Známe výlety na marec: kratšie, kým sú dni krátke");
    expect(knownTitle(7, "sk")).toBe("Známe výlety na júl");
  });
});
