import { describe, expect, it } from "vitest";
import { stopsAdvice } from "./stopsAdvice";

const at = (hhmm: string) => new Date(`2026-11-14T${hhmm}:00Z`);
const hh = (d: Date) => d.toISOString().slice(11, 16);
const plan = (end: string, sunset = "16:04", start = "09:00", sunrise = "06:30") => ({
  hikeStart: at(start),
  hikeEnd: at(end),
  sunrise: at(sunrise),
  sunset: at(sunset),
});
const stops = [
  { id: "a", name: "Salaš", minutes: 35 },
  { id: "b", name: "Potok", minutes: 10 },
  { id: "c", name: "Tanečnica", minutes: 12 },
];

describe("stopsAdvice", () => {
  it("stays quiet when the walk ends before sunset", () => {
    expect(stopsAdvice(plan("15:50"), stops)).toBeNull();
  });

  it("stays quiet when it is late even without the stops", () => {
    expect(stopsAdvice(plan("17:30"), stops)).toBeNull();
  });

  it("stays quiet with no stops", () => {
    expect(stopsAdvice(plan("16:30"), [])).toBeNull();
  });

  it("offers the cheapest stop whose removal is enough", () => {
    const a = stopsAdvice(plan("16:07"), stops)!; // 57 min of stops, 3 min late
    expect(a.stopMin).toBe(57);
    expect(a.removal?.ids).toEqual(["b"]); // 10 min is enough and the fewest
    expect(hh(a.removal!.backAt)).toBe("15:57");
  });

  it("offers the fewest stops that are enough, biggest first, when no single one is", () => {
    const a = stopsAdvice(plan("16:58"), [
      { id: "a", name: "A", minutes: 30 },
      { id: "b", name: "B", minutes: 30 },
      { id: "c", name: "C", minutes: 5 },
    ])!; // 65 min of stops, 54 late: one stop leaves 16:28, two reach 15:58
    expect(a.removal?.ids).toEqual(["a", "b"]);
    expect(hh(a.removal!.backAt)).toBe("15:58");
  });

  it("says nothing when the stops are not the cause, so never advises a removal that would not help", () => {
    expect(stopsAdvice(plan("17:30"), [{ id: "a", name: "A", minutes: 20 }])).toBeNull();
  });

  it("starts earlier by what is late, rounded down to 5 minutes", () => {
    const a = stopsAdvice(plan("16:07"), stops)!;
    expect(hh(a.earlier!.start)).toBe("08:55"); // 09:00 - 3 min = 08:57 -> 08:55
    expect(hh(a.earlier!.backAt)).toBe("16:02");
  });

  it("drops the earlier start when it would be before sunrise", () => {
    const a = stopsAdvice(plan("16:07", "16:04", "06:32", "06:30"), stops)!;
    expect(a.earlier).toBeNull();
    expect(a.removal).not.toBeNull();
  });
});
