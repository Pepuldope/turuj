// A walking-time filter also lists a place through a clearly longer route to it (Peter, 2026-11-24).
import { describe, expect, it } from "vitest";
import { longerFit, realMatchesFirst } from "@/lib/data";

const over6h = (m: number) => m >= 361;
const from4to6h = (m: number) => m >= 241 && m <= 360;
const same = (m: number) => m;
const withKids = (m: number) => Math.round(m * 1.3);

describe("longerFit", () => {
  it("lists a short main route under 'nad 6 h' through its longer route, and names that walk", () => {
    expect(longerFit([300, 410, 520], false, same, over6h)).toBe(410);
  });

  it("names the shortest longer route that fits the picked time", () => {
    expect(longerFit([300, 410], false, same, from4to6h)).toBe(300);
  });

  it("says nothing when the place is on the list anyway", () => {
    expect(longerFit([410], true, same, over6h)).toBeNull();
  });

  it("does not list a place whose longer routes miss the picked time", () => {
    expect(longerFit([200, 230], false, same, over6h)).toBeNull();
    expect(longerFit(undefined, false, same, over6h)).toBeNull();
  });

  it("counts the kids pace: a 5 h route is over 6 h with kids", () => {
    expect(longerFit([300], false, same, over6h)).toBeNull();
    expect(longerFit([300], false, withKids, over6h)).toBe(390);
  });
});

describe("realMatchesFirst", () => {
  it("puts places listed through a longer route after the real matches, keeping each group's order", () => {
    const items = [{ id: "beckov", longMin: 410 }, { id: "dumbier", longMin: null }, { id: "orava", longMin: 420 }, { id: "kralova-hola" }];
    expect(realMatchesFirst(items).map((i) => i.id)).toEqual(["dumbier", "kralova-hola", "beckov", "orava"]);
  });
});
