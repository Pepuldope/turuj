import { describe, expect, it } from "vitest";
import { skippedNote, walkFacts } from "./walkFacts";
import { parkingTeaser } from "./tripAnswers";
import type { ParkingLot } from "./types";

/** A car park 150 m from the trail that joins it part-way up (Devín): the stretch below is skipped. */
const join = { location: { lat: 48, lon: 17 }, walk_m: 150, skip_out: 0.2, skip_back: 0.2, skip_m: 300, skip_ascent_m: 20 };
const trail = { distance_m: 3000, ascent_m: 200, duration_min: 60 };

describe("parking lines agree", () => {
  it("never says 'right on the trail' next to '150 m od trasy'", () => {
    const lot = { name: "Parkovisko", walk_m: 150, fee: false, join } as unknown as ParkingLot;
    const facts = walkFacts(trail, { join });
    const note = skippedNote(false, facts.approachMin);
    const teaser = parkingTeaser("sk", lot);
    expect(facts.approachMin).toBeGreaterThan(0);
    expect(teaser).toContain("150 m od trasy");
    expect(note).not.toContain("priamo pri trase");
  });

  it("says 'right on the trail' only when the walk to it is under 150 m, in both lines", () => {
    const near = { ...join, walk_m: 40 };
    const lot = { name: "Parkovisko", walk_m: 40, fee: false, join: near } as unknown as ParkingLot;
    const facts = walkFacts(trail, { join: near });
    expect(facts.approachMin).toBe(0);
    expect(skippedNote(false, facts.approachMin)).toContain("priamo pri trase");
    expect(parkingTeaser("sk", lot)).toContain("pri trase");
  });
});
