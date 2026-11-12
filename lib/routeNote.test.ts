import { describe, expect, it } from "vitest";
import { routeNote } from "./routeNote";

// December: CET, so 06:30 UTC is 07:30 in Slovakia.
const rise = new Date("2026-12-12T06:30:00Z"); // 07:30
const set = new Date("2026-12-12T15:30:00Z"); // 16:30

describe("routeNote", () => {
  it("is fine when a late-morning start still gets back in the light", () => {
    expect(routeNote(rise, set, 180)).toEqual({ kind: "ok" }); // latest 13:00
  });
  it("asks for an early start on a long walk, rounded down to 5 minutes", () => {
    // Sunset 16:30 less 30 min: 6 h of walking gives 10:00 (fine), 6 h 7 min gives 09:53, shown as 09:50.
    expect(routeNote(rise, set, 360)).toEqual({ kind: "ok" });
    expect(routeNote(rise, set, 367)).toEqual({ kind: "long", latest: "09:50" });
  });
  it("is too long for a day whose latest start is before sunrise", () => {
    expect(routeNote(rise, set, 8 * 60 + 30)).toEqual({ kind: "too-long" }); // latest 07:30
  });
  it("needs a quarter of an hour after sunrise", () => {
    expect(routeNote(rise, set, 8 * 60 + 10)).toEqual({ kind: "long", latest: "07:50" });
    expect(routeNote(rise, set, 8 * 60 + 20)).toEqual({ kind: "too-long" }); // latest 07:40, before sunrise + 15 min = 07:45
  });
});
