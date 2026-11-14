import { describe, expect, it } from "vitest";
import { packList, packTeaser } from "@/lib/tripPacking";
import type { PackInput } from "@/lib/tripPacking";

const base: PackInput = { month: 7, walkMin: 120, topM: 800, waterOnWalk: true, foodOnWalk: true, familyFriendly: false };
const shorts = (i: Partial<PackInput>) => packList("sk", { ...base, ...i }).map((x) => x.short);

describe("packList", () => {
  it("is just water for a short summer walk", () => {
    expect(shorts({})).toEqual(["voda"]);
  });
  it("adds a headlamp in Nov-Feb, or when the walk fills the daylight", () => {
    expect(shorts({ month: 12 })).toContain("čelovka");
    expect(shorts({ month: 11 })).toContain("čelovka");
    expect(shorts({ month: 3 })).not.toContain("čelovka");
    expect(shorts({ latestStartMin: 8 * 60 })).toContain("čelovka");
    expect(shorts({ latestStartMin: null })).toContain("čelovka");
    expect(shorts({ latestStartMin: 12 * 60 })).not.toContain("čelovka");
  });
  it("warns about little water only when no spring, hut or food place is on the walk", () => {
    const texts = packList("sk", { ...base, waterOnWalk: false }).map((x) => x.text);
    expect(texts.some((t) => t.includes("vodu si preto vezmite celú z domu"))).toBe(true);
    expect(packList("sk", base).some((x) => x.text.includes("celú z domu"))).toBe(false);
  });
  it("adds warm things for high tops and winter", () => {
    expect(shorts({ topM: 1800 })).toContain("čiapka a rukavice");
    expect(shorts({ month: 1 })).toContain("čiapka a rukavice");
  });
  it("mentions traction only for high routes from November to April, never says the trail is icy", () => {
    expect(shorts({ topM: 2000, month: 12 })).toContain("nesmeky");
    expect(shorts({ topM: 2000, month: 7 })).not.toContain("nesmeky");
    expect(shorts({ topM: 900, month: 12 })).not.toContain("nesmeky");
    const text = packList("sk", { ...base, topM: 2000, month: 12 }).map((x) => x.text).join(" ");
    expect(text).not.toMatch(/zľadovat|ľad(?!ov)|námraz/i);
  });
  it("adds food for walks of 4 h or more without a food place", () => {
    expect(shorts({ walkMin: 300, foodOnWalk: false })).toContain("jedlo");
    expect(shorts({ walkMin: 300, foodOnWalk: true })).not.toContain("jedlo");
    expect(shorts({ walkMin: 100, foodOnWalk: false })).not.toContain("jedlo");
  });
  it("adds a kids line for family-friendly trips", () => {
    expect(shorts({ familyFriendly: true })).toContain("desiata pre deti");
  });
  it("makes a teaser from the short names", () => {
    expect(packTeaser(packList("sk", { ...base, month: 12 }))).toBe("Voda, čelovka, čiapka a rukavice");
  });
});
