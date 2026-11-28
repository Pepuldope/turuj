import { describe, expect, it } from "vitest";
import { shareImage, type PlacePhoto } from "@/lib/tripFiles";
import { ownImages } from "@/lib/sitemapEntries";
import { terrainKeyOf } from "@/lib/terrainScene";
import { factsLine, hashOf, terrainHashOf, terrainKeys, terrainSvgOf } from "@/scripts/share-pics";

const photo = (url: string, extra: Partial<PlacePhoto> = {}): PlacePhoto => ({ url, w: 500, h: 375, author: "x", license: "CC0", page: "p", ...extra });

describe("shareImage", () => {
  it("re-addresses a Commons thumbnail to the 1280 px step", () => {
    const s = shareImage(photo("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/500px-F.jpg"));
    expect(s).toEqual({ url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/1280px-F.jpg", width: 1280, height: 960 });
  });
  it("takes a self-hosted copy's share size from its Commons original", () => {
    const src = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/500px-F.jpg";
    expect(shareImage(photo("/photos/c/0123456789-F.jpg-500px.jpg", { src }))).toEqual({ url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/1280px-F.jpg", width: 1280, height: 960 });
  });
  it("prefers the generated 1200x630 share picture when there is one", () => {
    const src = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/500px-F.jpg";
    expect(shareImage(photo(src, { share: "/og/p/0123456789ab.jpg" }))).toEqual({ url: "/og/p/0123456789ab.jpg", width: 1200, height: 630 });
  });
  it("leaves Mapillary photos alone", () => {
    expect(shareImage(photo("/photos/m/a.jpg", { via: "mapillary" })).url).toBe("/photos/m/a.jpg");
  });
});

describe("ownImages", () => {
  it("claims only our own copies, as absolute URLs", () => {
    expect(ownImages("/photos/c/x-500px.jpg")).toEqual(["https://turuj.sk/photos/c/x-500px.jpg"]);
    expect(ownImages("https://thumb.wikimedia.org/x")).toBeUndefined();
    expect(ownImages(undefined)).toBeUndefined();
  });
});

describe("terrain share cards", () => {
  const layers = [[10, 5, 2, 5, -2], [8, 5, 1], [6, 5, 0]];
  const svg = "<svg>a</svg>";
  it("finds a trip's place under one key, shared by its variants", () => {
    expect(terrainKeyOf({ destination: { osm: "node/1" }, variant_of: "x", slug: "y" })).toBe("node/1");
    expect(terrainKeyOf({ destination: { osm: null }, slug: "main" })).toBe("trip/main");
    expect(terrainKeyOf({ destination: { osm: null }, variant_of: "main", slug: "main-other" })).toBe("trip/main");
  });
  it("hashes the picture, the name and the kind, and differs from a photo card's hash", () => {
    const h = terrainHashOf("node/1", "Hrad", "hrad", svg);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    expect(terrainHashOf("node/1", "Hrad", "hrad", svg)).toBe(h);
    expect(terrainHashOf("node/1", "Hrad 2", "hrad", svg)).not.toBe(h);
    expect(terrainHashOf("node/1", "Hrad", "vrchol", svg)).not.toBe(h);
    expect(terrainHashOf("node/1", "Hrad", "hrad", "<svg>b</svg>")).not.toBe(h);
    expect(hashOf("node/1", "https://x/y.jpg", "Hrad", "hrad", photo("https://x/y.jpg"))).not.toBe(h);
  });
  it("redraws when the layers change", () => {
    const a = terrainSvgOf("node/1", { k: "vrchol", banner: layers });
    const b = terrainSvgOf("node/1", { k: "vrchol", banner: [[11, 5, 2, 5, -2], layers[1], layers[2]] });
    expect(terrainHashOf("node/1", "V", "vrchol", a)).not.toBe(terrainHashOf("node/1", "V", "vrchol", b));
  });
  it("gives a terrain job only to a known place without a photo", () => {
    const places = new Map([["a", { key: "a", name: "A", kind: "vrchol" }], ["b", { key: "b", name: "B", kind: "hrad" }]]);
    const terrain = { a: { k: "vrchol" as const, banner: layers }, b: { k: "hrad" as const, banner: layers }, c: { k: "vrchol" as const, banner: layers } };
    expect(terrainKeys(terrain, { b: {} }, places)).toEqual(["a"]);
  });
});

describe("factsLine", () => {
  it("says length, climb, time and region (C52)", () => {
    expect(factsLine({ distance_m: 14400, ascent_m: 581, duration_min: 315, region_name: "Levočské vrchy" })).toBe("Hlavná trasa: 14,4 km · ↑\u00a0581\u00a0m · 5\u00a0h\u00a015 · Levočské vrchy");
  });
  it("leaves out what is missing, and a climb under 10 m", () => {
    expect(factsLine({ distance_m: 2000, ascent_m: 4, duration_min: null, region_name: null })).toBe("Hlavná trasa: 2,0 km");
    expect(factsLine({})).toBe("");
  });
});
