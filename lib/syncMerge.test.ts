// The pure merge rule of account sync: item checks and who wins.
import { describe, expect, it } from "vitest";
import { MAX_PLAN_BODY, cleanItem, decide } from "@/lib/syncMerge";
import type { Held, WireItem } from "@/lib/syncMerge";

const NOW = 1_800_000_000_000;
const plan = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, name: "Rysy", date: "2026-08-01", ...extra });
const visit = { slug: "rysy", route: "rysy", name: "Rysy", date: "2026-08-01", from: "plan" };

describe("cleanItem keys", () => {
  it("takes trail slugs for plans", () => {
    expect(cleanItem("plan", { key: "rysy", at: 5, body: plan("rysy") }, NOW)).not.toBeNull();
    expect(cleanItem("plan", { key: "a-1", at: 5 }, NOW)).not.toBeNull();
    for (const key of ["Rysy", "-rysy", "ry sy", "", "a".repeat(121), "p:rysy", 5, null]) {
      expect(cleanItem("plan", { key, at: 5, gone: true }, NOW), String(key)).toBeNull();
    }
  });
  it("takes p: and m: keys for visits", () => {
    expect(cleanItem("visit", { key: "p:rysy:2026-08-01", at: 5, gone: true }, NOW)).not.toBeNull();
    expect(cleanItem("visit", { key: "m:Ab_1-2", at: 5, body: visit }, NOW)).not.toBeNull();
    expect(cleanItem("visit", { key: "p:krivan/okruh:2026-08-01", at: 5, gone: true }, NOW)).not.toBeNull();
    for (const key of ["rysy", "x:abc", "p:", "p:a b", "p:" + "a".repeat(161)]) {
      expect(cleanItem("visit", { key, at: 5, gone: true }, NOW), key).toBeNull();
    }
  });
  it("rejects what is not an object", () => {
    for (const raw of [null, 3, "x", [], undefined]) expect(cleanItem("plan", raw, NOW)).toBeNull();
  });
});

describe("cleanItem at and gone", () => {
  it("needs a positive whole number", () => {
    for (const at of [0, -1, 1.5, NaN, Infinity, "5", null, undefined]) expect(cleanItem("plan", { key: "a", at, gone: true }, NOW), String(at)).toBeNull();
  });
  it("clamps a time in the future to now", () => {
    expect(cleanItem("plan", { key: "a", at: NOW + 365 * 86400_000, gone: true }, NOW)).toEqual({ key: "a", at: NOW, gone: true });
    expect(cleanItem("plan", { key: "a", at: NOW - 1, gone: true }, NOW)?.at).toBe(NOW - 1);
  });
  it("counts only gone: true", () => {
    expect(cleanItem("plan", { key: "a", at: 5, gone: 1 }, NOW)).toEqual({ key: "a", at: 5 });
    expect(cleanItem("plan", { key: "a", at: 5, gone: "true" }, NOW)).toEqual({ key: "a", at: 5 });
    expect(cleanItem("plan", { key: "a", at: 5, gone: true, body: plan("a") }, NOW)).toEqual({ key: "a", at: 5, gone: true });
  });
});

describe("cleanItem plan body", () => {
  it("must be a plain object about the same trail", () => {
    expect(cleanItem("plan", { key: "a", at: 5, body: [] }, NOW)).toBeNull();
    expect(cleanItem("plan", { key: "a", at: 5, body: null }, NOW)).toBeNull();
    expect(cleanItem("plan", { key: "a", at: 5, body: "x" }, NOW)).toBeNull();
    expect(cleanItem("plan", { key: "a", at: 5, body: plan("b") }, NOW)).toBeNull();
  });
  it("loses the fields that belong to one device", () => {
    const got = cleanItem("plan", { key: "a", at: 5, body: plan("a", { offline: "ok", eve: true, weather: { url: "x" }, hikeMin: 90 }) }, NOW);
    expect(got?.body).toEqual(plan("a", { hikeMin: 90 }));
  });
  it("has a size limit", () => {
    expect(cleanItem("plan", { key: "a", at: 5, body: plan("a", { pad: "x".repeat(MAX_PLAN_BODY) }) }, NOW)).toBeNull();
    expect(cleanItem("plan", { key: "a", at: 5, body: plan("a", { pad: "x".repeat(MAX_PLAN_BODY - 200) }) }, NOW)).not.toBeNull();
  });
  it("may be missing (only the version is named)", () => {
    expect(cleanItem("plan", { key: "a", at: 5 }, NOW)).toEqual({ key: "a", at: 5 });
  });
});

describe("cleanItem visit body", () => {
  const ok = (b: unknown) => cleanItem("visit", { key: "m:1", at: 5, body: b }, NOW);
  it("keeps exactly five fields", () => {
    expect(ok({ ...visit, junk: 1, offline: "x" })?.body).toEqual(visit);
  });
  it("checks each field", () => {
    expect(ok({ ...visit, slug: "Bad Slug" })).toBeNull();
    expect(ok({ ...visit, slug: 3 })).toBeNull();
    expect(ok({ ...visit, name: "" })).toBeNull();
    expect(ok({ ...visit, name: "x".repeat(201) })).toBeNull();
    expect(ok({ ...visit, name: "x".repeat(200) })).not.toBeNull();
    expect(ok({ ...visit, date: "1.8.2026" })).toBeNull();
    expect(ok({ ...visit, date: "2026-08" })).toBeNull();
    expect(ok({ ...visit, date: "2026" })).not.toBeNull();
    expect(ok({ ...visit, date: "" })).not.toBeNull();
    expect(ok({ ...visit, from: "other" })).toBeNull();
    expect(ok({ ...visit, from: "manual" })).not.toBeNull();
    expect(ok({ slug: "rysy", name: "R", date: "" })).toBeNull();
  });
  it("needs a route, and takes a loop but no other suffix", () => {
    expect(ok({ slug: "rysy", name: "R", date: "", from: "plan" })).toBeNull();
    expect(ok({ ...visit, route: 3 })).toBeNull();
    expect(ok({ ...visit, route: "" })).toBeNull();
    expect(ok({ ...visit, route: "rysy/okruh" })).not.toBeNull();
    expect(ok({ ...visit, route: "rysy/okruh2" })).toBeNull();
    expect(ok({ ...visit, route: "rysy/other" })).toBeNull();
    expect(ok({ ...visit, route: "rysy/okruh/okruh" })).toBeNull();
    expect(ok({ ...visit, route: "Rysy" })).toBeNull();
  });
  it("takes an empty place", () => {
    expect(ok({ ...visit, slug: "" })?.body).toEqual({ ...visit, slug: "" });
  });
  it("takes each form of date and refuses bad ones", () => {
    for (const date of ["2026-08-01", "2026", "2026-sp", "2026-su", "2026-au", "2026-wi", ""]) expect(ok({ ...visit, date }), date).not.toBeNull();
    for (const date of ["2026-xx", "2026-13", "26", "2026-summer", "2026-su-01"]) expect(ok({ ...visit, date }), date).toBeNull();
  });
});

const held = (entries: Record<string, Partial<Held>>) => new Map<string, Held>(Object.entries(entries).map(([k, v]) => [k, { at: 10, gone: false, size: 5, ...v }]));
const live = (key: string, at: number): WireItem => ({ key, at, body: { slug: key } });

describe("decide", () => {
  it("stores what the client has newer", () => {
    expect(decide([live("a", 20)], held({ a: { at: 10 } }), false)).toEqual({ store: [live("a", 20)], sendKeys: [], want: [] });
  });
  it("sends what the server has newer", () => {
    expect(decide([live("a", 5)], held({ a: { at: 10 } }), false)).toEqual({ store: [], sendKeys: ["a"], want: [] });
  });
  it("does nothing when equal", () => {
    expect(decide([{ key: "a", at: 10 }], held({ a: { at: 10 } }), false)).toEqual({ store: [], sendKeys: [], want: [] });
  });
  it("stores an item the server does not know", () => {
    expect(decide([live("a", 1)], held({}), false).store).toEqual([live("a", 1)]);
  });
  it("sends what the client does not list", () => {
    expect(decide([], held({ a: {}, b: {} }), false).sendKeys).toEqual(["a", "b"]);
  });
  it("asks for the body when a body-less item is newer or new", () => {
    expect(decide([{ key: "a", at: 20 }, { key: "n", at: 1 }], held({ a: { at: 10 } }), false)).toEqual({ store: [], sendKeys: [], want: ["a", "n"] });
  });
  it("stores a tombstone without asking for anything", () => {
    expect(decide([{ key: "a", at: 20, gone: true }], held({ a: {} }), false).store).toEqual([{ key: "a", at: 20, gone: true }]);
  });
  it("does not send a held tombstone to a device that does not list it", () => {
    expect(decide([], held({ a: { gone: true }, b: {} }), false).sendKeys).toEqual(["b"]);
  });
  it("does send a held tombstone that is newer than a listed old copy", () => {
    expect(decide([live("a", 5)], held({ a: { gone: true, at: 10 } }), false).sendKeys).toEqual(["a"]);
  });
  it("sends nothing unlisted when partial", () => {
    expect(decide([live("a", 20)], held({ a: {}, b: {} }), true)).toEqual({ store: [live("a", 20)], sendKeys: [], want: [] });
  });
  it("lets the highest at count for a repeated key", () => {
    const r = decide([live("a", 5), live("a", 30), live("a", 20)], held({ a: { at: 10 } }), false);
    expect(r.store).toEqual([live("a", 30)]);
    expect(r.sendKeys).toEqual([]);
  });
});
