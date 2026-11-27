// C235: a route can hold several plans, each under its own key, and account sync keeps them apart.
import { describe, expect, it } from "vitest";
import { keySlug, newPlanKey, planKey } from "@/lib/savedTrips";
import { cleanItem } from "@/lib/syncMerge";

const NOW = 1_800_000_000_000;
const body = (extra: Record<string, unknown> = {}) => ({ slug: "rysy", name: "Rysy", date: "2026-08-01", ...extra });

describe("plan keys", () => {
  it("is the slug for a route's first plan and its own key for the others", () => {
    expect(planKey({ slug: "rysy" })).toBe("rysy");
    expect(planKey({ slug: "rysy", key: "rysy--abc" })).toBe("rysy--abc");
  });
  it("makes a new key from the slug that is never taken", () => {
    const a = newPlanKey("rysy", ["rysy"], 1000);
    expect(a).toBe(`rysy--${(1000).toString(36)}`);
    expect(newPlanKey("rysy", ["rysy", a], 1000)).not.toBe(a);
    expect(keySlug(a)).toBe("rysy");
    expect(keySlug("rysy")).toBe("rysy");
    expect(keySlug("hrad-strecno")).toBe("hrad-strecno");
  });
});

describe("sync takes a second plan of a route", () => {
  it("under its own key", () => {
    const key = newPlanKey("rysy", ["rysy"], NOW);
    expect(cleanItem("plan", { key, at: 5, body: body({ key }) }, NOW)).not.toBeNull();
    expect(cleanItem("plan", { key: "rysy", at: 5, body: body() }, NOW)).not.toBeNull();
  });
  it("never under a key the body does not name, nor a key of another route", () => {
    const key = newPlanKey("rysy", [], NOW);
    expect(cleanItem("plan", { key, at: 5, body: body() }, NOW)).toBeNull();
    expect(cleanItem("plan", { key: "rysy", at: 5, body: body({ key }) }, NOW)).toBeNull();
    expect(cleanItem("plan", { key: "krivan--abc", at: 5, body: body({ key: "krivan--abc" }) }, NOW)).toBeNull();
  });
});
