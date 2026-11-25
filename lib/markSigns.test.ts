import { describe, expect, it } from "vitest";
import { cleanRuns, markingAt, markingRuns, markSigns } from "@/lib/markSigns";
import type { TripDetail } from "@/lib/tripSchema";

// A straight walk north, one point every ~11 m (0.0001° of latitude).
const path: TripDetail["path"] = Array.from({ length: 101 }, (_, i) => [19, 48 + i * 0.0001, null]);

describe("markSigns", () => {
  it("puts a sign where the marking changes, with the colour before it for the way back", () => {
    const { start, signs } = markSigns({ path, marking_runs: [{ from: 0, to: 40, colour: "red" }, { from: 40, to: 100, colour: "blue" }] });
    expect(start).toBe("red");
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ colour: "blue", before: "red" });
    expect(signs[0].location.lat).toBeCloseTo(48.004);
  });

  it("drops a few metres of road between two stretches of the same marking", () => {
    const runs = cleanRuns(path, [
      { from: 0, to: 40, colour: "red" },
      { from: 40, to: 43, colour: null },
      { from: 43, to: 100, colour: "red" },
    ]);
    expect(runs).toEqual([expect.objectContaining({ from: 0, to: 100, colour: "red" })]);
  });

  it("starts the next marking where the old one ends when a short unmarked step sits between", () => {
    const { signs } = markSigns({
      path,
      marking_runs: [
        { from: 0, to: 40, colour: "red" },
        { from: 40, to: 43, colour: null },
        { from: 43, to: 100, colour: "green" },
      ],
    });
    expect(signs).toEqual([expect.objectContaining({ colour: "green", before: "red" })]);
    expect(signs[0].location.lat).toBeCloseTo(48.0043);
  });

  it("keeps a long unmarked stretch as a change of its own", () => {
    const { signs } = markSigns({
      path,
      marking_runs: [
        { from: 0, to: 30, colour: "red" },
        { from: 30, to: 60, colour: null },
        { from: 60, to: 100, colour: "red" },
      ],
    });
    expect(signs.map((s) => s.colour)).toEqual([null, "red"]);
  });

  it("has no signs for a walk on one marking or without runs", () => {
    expect(markSigns({ path, marking_runs: [{ from: 0, to: 100, colour: "yellow" }] }).signs).toEqual([]);
    expect(markSigns({ path, marking_runs: [] })).toEqual({ start: null, signs: [] });
  });
});

describe("markingAt", () => {
  // Burianka from Hnúšťa: blue, a stretch with no marking, blue again.
  const signs = [
    { at: 10, f: 0.5, colour: null },
    { at: 14, colour: "blue" as const },
  ];

  it("keeps the start's marking until the first sign", () => {
    expect(markingAt(signs, "blue", 0)).toBe("blue");
    expect(markingAt(signs, "blue", 10.4)).toBe("blue");
    expect(markingAt([], "red", 5)).toBe("red");
  });

  it("has no marking after a 'no marking' sign, not the start's colour", () => {
    expect(markingAt(signs, "blue", 10.5)).toBeNull();
    expect(markingAt(signs, "blue", 13.9)).toBeNull();
    expect(markingAt(signs, "blue", 14)).toBe("blue");
  });

  it("starts unmarked when the walk starts unmarked", () => {
    expect(markingAt(signs, null, 3)).toBeNull();
  });
});

describe("markingRuns", () => {
  // A walk north and back: 5 points up (0 to 4), the same 4 back down.
  const there: [number, number][] = [0, 1, 2, 3, 4].map((i) => [48 + i * 0.001, 19]);
  const line = [...there, ...there.slice(0, -1).reverse()];
  const sign = (at: number, f: number, colour: "blue" | null) => ({ at, f, colour, location: { lat: 48 + (at + f) * 0.001, lon: 19 } });
  // Blue, no marking from 1.25 to 2.5, blue again.
  const signs = [sign(1, 0.25, null), sign(2, 0.5, "blue")];
  const lats = (pts: [number, number][]) => pts.map(([lat]) => Math.round((lat - 48) * 1e6) / 1000);

  it("changes colour at the sign itself, not at the line's nearest point", () => {
    const runs = markingRuns(line, signs, "blue", false);
    expect(runs.map((r) => r.colour)).toEqual(["blue", null, "blue", null, "blue"]);
    expect(lats(runs[0].points)).toEqual([0, 1, 1.25]);
    expect(lats(runs[1].points)).toEqual([1.25, 2, 2.5]);
    // Over the top and back down to the same sign.
    expect(lats(runs[2].points)).toEqual([2.5, 3, 4, 3, 2.5]);
    expect(lats(runs[3].points)).toEqual([2.5, 2, 1.25]);
    expect(lats(runs[4].points)).toEqual([1.25, 1, 0]);
    expect(runs.every((r) => !r.faint)).toBe(true);
  });

  it("is one run when there is no sign", () => {
    const runs = markingRuns(line, [], "red", false);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ colour: "red", faint: false });
    expect(runs[0].points).toHaveLength(line.length);
  });

  it("does not mirror a loop", () => {
    const runs = markingRuns(line, signs, "blue", true);
    expect(runs.map((r) => r.colour)).toEqual(["blue", null, "blue"]);
    expect(lats(runs[2].points)).toEqual([2.5, 3, 4, 3, 2, 1, 0]);
  });

  it("parked up the trail: the skipped ends come first and faint, in their own colours", () => {
    // Joined at 1.5 on the way up, left at the same spot on the way down (6.5).
    const spot: [number, number] = [48.0015, 19];
    const runs = markingRuns(line, signs, "blue", false, { from: 1.5, to: 6.5, a: spot, b: spot });
    expect(runs.map((r) => [r.colour, r.faint])).toEqual([
      ["blue", true],
      [null, true],
      [null, true],
      ["blue", true],
      [null, false],
      ["blue", false],
      [null, false],
    ]);
    expect(lats(runs[1].points)).toEqual([1.25, 1.5]);
    expect(lats(runs[4].points)).toEqual([1.5, 2, 2.5]);
    expect(lats(runs[6].points)).toEqual([2.5, 2, 1.5]);
  });
});
