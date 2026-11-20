import { describe, expect, it } from "vitest";
import { shareImage, type PlacePhoto } from "@/lib/tripFiles";
import { ownImages } from "@/lib/sitemapEntries";

const photo = (url: string, extra: Partial<PlacePhoto> = {}): PlacePhoto => ({ url, w: 500, h: 375, author: "x", license: "CC0", page: "p", ...extra });

describe("shareImage", () => {
  it("re-addresses a Commons thumbnail to the 1280 px step", () => {
    const s = shareImage(photo("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/500px-F.jpg"));
    expect(s).toEqual({ url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/F.jpg/1280px-F.jpg", width: 1280, height: 960 });
  });
  it("re-addresses a self-hosted copy to its 1280 px file", () => {
    expect(shareImage(photo("/photos/c/0123456789-F.jpg-500px.jpg"))).toEqual({ url: "/photos/c/0123456789-F.jpg-1280px.jpg", width: 1280, height: 960 });
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
