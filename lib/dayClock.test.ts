import { describe, expect, it } from "vitest";
import { dayPlace, trailColours } from "@/lib/dayClock";
import type { DayModel } from "@/lib/dayClock";

const trail = {
  points: [
    { ele: 0, at: 0, colour: null, pos: [48, 19] as [number, number] },
    { ele: 100, at: 0.5, colour: "yellow" as const, pos: [48, 19.2] as [number, number] },
    { ele: 0, at: 1, colour: "red" as const, pos: [48, 19.4] as [number, number] },
  ],
  goalIndex: 1,
  goalName: "Vrch",
  goalKind: "vrchol" as const,
  loop: false,
};
const HOUR = 3600000;
const model: DayModel = { hs: 0, he: 10 * HOUR, trail, approach: 0, pauses: [], goalTime: 5 * HOUR, stops: [], mode: "car" };

describe("dayPlace", () => {
  it("stands at the ride before and after the hike", () => {
    expect(dayPlace(model, -1).kind).toBe("ride");
    expect(dayPlace(model, 11 * HOUR).kind).toBe("ride");
  });
  it("walks the trail by the share of the hike, as the dial does", () => {
    expect(dayPlace(model, 5 * HOUR)).toEqual({ kind: "trail", pos: [48, 19.2] });
    const q = dayPlace(model, 2.5 * HOUR);
    expect(q.kind === "trail" && q.pos?.[1]).toBeCloseTo(19.1);
  });
  it("holds still while standing at a stop", () => {
    const m = { ...model, pauses: [{ from: 0.4, to: 0.6 }] };
    const a = dayPlace(m, 4.2 * HOUR);
    const b = dayPlace(m, 5.8 * HOUR);
    expect(a).toEqual(b);
  });
  it("starts with the walk to the trail", () => {
    const m = { ...model, approach: 0.1 };
    expect(dayPlace(m, 0.5 * HOUR)).toEqual({ kind: "approach", f: 0.5, back: false });
    const back = dayPlace(m, 9.5 * HOUR);
    expect(back.kind === "approach" && back.back).toBe(true);
    expect(back.kind === "approach" && back.f).toBeCloseTo(0.5);
  });
});

describe("trailColours", () => {
  it("names the colours the picture shows, not a few metres of another", () => {
    const c = trailColours(trail, 0, 10 * HOUR, 20 * HOUR);
    expect(c).toHaveLength(2);
  });
});
