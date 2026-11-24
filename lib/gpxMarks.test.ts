import { describe, expect, it } from "vitest";
import { gpxMarks, type GpxMarksInput } from "@/lib/gpxMarks";
import { tr } from "@/lib/lang";

const sk = (s: string, v?: Record<string, string | number>) => tr("sk", s, v);
const en = (s: string, v?: Record<string, string | number>) => tr("en", s, v);

const base: GpxMarksInput = {
  walking: false,
  transit: false,
  parking: { name: "Parkovisko Podlesok", location: { lat: 48.95, lon: 20.38 } },
  stop: { name: "Hrabušice, Podlesok", location: { lat: 48.951, lon: 20.381 } },
  trailStart: { lat: 48.94, lon: 20.39 },
  trailJoin: { lat: 48.94, lon: 20.39 },
  skip: null,
  approachMin: 0,
};

describe("gpxMarks", () => {
  it("marks only the car park when it is at the trail start", () => {
    const m = gpxMarks(base, sk);
    expect(m.points).toEqual([{ lat: 48.95, lon: 20.38, name: "Parkovisko: Parkovisko Podlesok" }]);
    expect(m.note).toBeNull();
  });

  it("marks the car park and the trail start when there is a walk to it", () => {
    const m = gpxMarks({ ...base, approachMin: 10 }, sk);
    expect(m.points.map((p) => p.name)).toEqual(["Parkovisko: Parkovisko Podlesok", "Začiatok trasy"]);
    expect(m.note).toContain("10 min chôdze od parkoviska");
  });

  it("marks the join and says the stretch below it is not counted", () => {
    const join = { lat: 48.93, lon: 20.4 };
    const m = gpxMarks({ ...base, approachMin: 5, trailJoin: join, skip: { skip_m: 1200 } }, sk);
    expect(m.points[1]).toEqual({ ...join, name: "Napojenie na trasu" });
    expect(m.note).toContain("Od parkoviska sa na ňu napojíte");
    expect(m.note).toContain("nepočíta");
  });

  it("a loop joined part-way says nothing about a shorter walk", () => {
    const m = gpxMarks({ ...base, trailJoin: { lat: 48.93, lon: 20.4 }, skip: { skip_m: 0 } }, sk);
    expect(m.note).not.toContain("nepočíta");
  });

  it("by bus it marks the stop", () => {
    const m = gpxMarks({ ...base, transit: true, approachMin: 15 }, sk);
    expect(m.points[0].name).toBe("Zastávka: Hrabušice, Podlesok");
    expect(m.note).toContain("od zastávky");
  });

  it("marks nothing on foot or without a car park", () => {
    expect(gpxMarks({ ...base, walking: true }, sk)).toEqual({ points: [], note: null });
    expect(gpxMarks({ ...base, parking: null }, sk)).toEqual({ points: [], note: null });
  });

  it("has English for every line", () => {
    const m = gpxMarks({ ...base, trailJoin: { lat: 48.93, lon: 20.4 }, skip: { skip_m: 500 } }, en);
    expect(m.points.map((p) => p.name)).toEqual(["Car park: Parkovisko Podlesok", "Where you join the trail"]);
    expect(m.note).not.toMatch(/[áäčďéíľĺňóôŕšťúýž]/);
  });
});
