import { describe, expect, it } from "vitest";
import { markedShareText, markingOrder, markingText, steepestStretch, terrainOf } from "@/lib/tripTerrain";
import type { MarkingRun } from "@/lib/tripSchema";

/** A straight path north, one point every 50 m, heights from `ele(i)`. 1 degree of latitude is ~111.2 km. */
const line = (n: number, ele: (i: number) => number | null) => Array.from({ length: n }, (_, i) => [19, 49 + (i * 50) / 111195, ele(i)] as [number, number, number | null]);

describe("steepestStretch", () => {
  it("finds the steep 500 m in a path that is flat, steep, flat", () => {
    // flat for 1 km, then 100 m of climbing over the next 500 m (20 %), then flat.
    const path = line(60, (i) => (i < 20 ? 1000 : i < 30 ? 1000 + (i - 20) * 10 : 1100));
    const s = steepestStretch(path)!;
    expect(s.gainM).toBe(100);
    expect(s.lenM).toBe(500);
    expect(s.atM).toBe(1000);
    expect(s.percent).toBe(20);
  });
  it("says nothing for a gentle path or missing heights", () => {
    expect(steepestStretch(line(60, (i) => 1000 + i))).toBeNull(); // 2 m per 50 m = 4 %
    expect(steepestStretch(line(60, () => null))).toBeNull();
  });
});

describe("marking", () => {
  const path = line(40, () => 1000);
  const runs: MarkingRun[] = [
    { from: 0, to: 10, colour: "yellow" },
    { from: 10, to: 12, colour: null },
    { from: 12, to: 20, colour: "yellow" },
    { from: 20, to: 21, colour: "red" }, // 50 m crossing: ignored
    { from: 21, to: 40, colour: "red" },
  ];
  it("lists colours in walking order, merging repeats and tiny runs", () => {
    expect(markingOrder(path, runs)).toEqual(["yellow", "red"]);
    expect(markingText("sk", ["yellow", "red"])).toBe("po žltej, potom po červenej");
  });
  it("cuts a long sequence", () => {
    expect(markingText("sk", ["red", "blue", "red", "blue", "green"])).toContain("a ďalšie");
  });
  it("words the marked share honestly", () => {
    expect(markedShareText("sk", 0.95)).toBe("celá po značke");
    expect(markedShareText("sk", 0.8)).toBe("väčšinou značená, asi 20 % bez značky");
    expect(markedShareText("sk", 0.5)).toContain("50 %");
    expect(markedShareText("sk", 2)).toBeNull();
  });
});

describe("terrainOf", () => {
  it("rounds heights to 5 m and climb to 10 m", () => {
    const t = terrainOf({ path: line(5, (i) => 1203 + i), marking_runs: [], route: "tam-a-spat", ascent_m: 803, max_ele_m: 2014, difficulty: "tazka", marked_share: 0.6 });
    expect(t).toMatchObject({ startM: 1205, topM: 2015, climbM: 800 });
  });
});

describe("steepestText", () => {
  it("leaves the percentage out above 35 %", async () => {
    const { steepestText } = await import("@/lib/tripTerrain");
    expect(steepestText("sk", { gainM: 190, lenM: 500, atM: 2300, percent: 38 })).not.toContain("sklon");
    expect(steepestText("sk", { gainM: 100, lenM: 500, atM: 1000, percent: 20 })).toContain("sklon okolo 20 %");
  });
});
