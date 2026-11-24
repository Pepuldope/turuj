import { describe, expect, it } from "vitest";
import { pixelNudge, sharpSize } from "@/lib/mapSharp";

describe("sharpSize", () => {
  it("keeps the slot's size where a point is a whole number of pixels", () => {
    expect(sharpSize(2099, 1)).toBe(2099);
    expect(sharpSize(979, 2)).toBe(979);
  });

  it("draws the map a little smaller where the slot would end between two pixels", () => {
    // The trip page's big map on a 4K monitor at 150 %: 2099 points are 3148.5 pixels, 2098 are 3147.
    expect(sharpSize(2099, 1.5)).toBe(2098);
    // At 125 % and 175 % every fourth point ends on a pixel.
    expect(sharpSize(1587, 1.25)).toBe(1584);
    expect(sharpSize(1733, 1.75)).toBe(1732);
    for (const dpr of [1.25, 1.5, 1.75]) for (let w = 300; w < 340; w++) expect((sharpSize(w, dpr) * dpr) % 1).toBe(0);
  });

  it("never takes more than 3 points, and leaves the slot alone at an odd page zoom", () => {
    for (const dpr of [1.25, 1.5, 1.75]) for (let w = 300; w < 340; w++) expect(w - sharpSize(w, dpr)).toBeLessThanOrEqual(3);
    expect(sharpSize(1001, 1.1)).toBe(1000);
    expect(sharpSize(1003, 1.1)).toBe(1000);
    expect(sharpSize(1004, 1.1)).toBe(1004);
  });
});

describe("pixelNudge", () => {
  it("is nothing for a map that already starts on a pixel", () => {
    expect(pixelNudge(461, 1)).toBe(0);
    expect(pixelNudge(34, 2)).toBe(0);
  });

  it("moves the day map onto a whole pixel, by half a pixel at most", () => {
    // Its top on the trip page: 619.953 points down.
    for (const dpr of [1, 1.25, 1.5, 1.75, 2]) {
      const n = pixelNudge(619.953, dpr);
      const edge = (619.953 + n) * dpr;
      expect(Math.abs(edge - Math.round(edge))).toBeLessThan(1e-6);
      expect(Math.abs(n * dpr)).toBeLessThanOrEqual(0.5);
    }
  });
});
