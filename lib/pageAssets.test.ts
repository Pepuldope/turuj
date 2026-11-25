import { describe, expect, it } from "vitest";
import { assetNames, deployQuery, gpxIn, withQuery } from "@/lib/pageAssets";

describe("assetNames", () => {
  it("reads script and stylesheet tags with their query", () => {
    const html = `<link rel="stylesheet" href="/_next/static/css/x.css?dpl=1"><script src="/_next/static/chunks/a.js?dpl=1" async></script>`;
    expect(assetNames(html)).toEqual(["/_next/static/css/x.css?dpl=1", "/_next/static/chunks/a.js?dpl=1"]);
  });
  it("reads paths inside escaped flight data", () => {
    expect(assetNames(String.raw`1:HL[\"/_next/static/chunks/b.js?dpl=1\",\"script\"]`)).toEqual(["/_next/static/chunks/b.js?dpl=1"]);
  });
  it("reads bare names inside a script and gives them the /_next/ prefix", () => {
    const js = `e.u=e=>"static/chunks/c.js";const f="static/media/font.woff2";`;
    expect(assetNames(js)).toEqual(["/_next/static/chunks/c.js", "/_next/static/media/font.woff2"]);
  });
  it("ignores static paths that are not the build's", () => {
    expect(assetNames(`<a href="/other/static/chunks/z.js">x</a> my_static/chunks/y.js`)).toEqual([]);
  });
  it("keeps each file once, in the order first seen", () => {
    const text = `"/_next/static/chunks/a.js?dpl=1" "static/chunks/b.js" "/_next/static/chunks/a.js?dpl=1"`;
    expect(assetNames(text)).toEqual(["/_next/static/chunks/a.js?dpl=1", "/_next/static/chunks/b.js"]);
  });
});

describe("deployQuery and withQuery", () => {
  it("takes the most common query", () => {
    expect(deployQuery(["/a.js?dpl=1", "/b.js?dpl=2", "/c.js?dpl=2", "/d.js"])).toBe("?dpl=2");
  });
  it("is empty when no URL has one", () => {
    expect(deployQuery(["/a.js"])).toBe("");
  });
  it("adds the query only to a path without one", () => {
    expect(withQuery("/_next/static/chunks/c.js", "?dpl=1")).toBe("/_next/static/chunks/c.js?dpl=1");
    expect(withQuery("/_next/static/chunks/a.js?dpl=9", "?dpl=1")).toBe("/_next/static/chunks/a.js?dpl=9");
  });
});

describe("gpxIn", () => {
  it("finds the first GPX address", () => {
    expect(gpxIn(`<a href="/gpx/rysy.gpx" download>GPX</a> <a href="/gpx/other.gpx">`)).toBe("/gpx/rysy.gpx");
  });
  it("finds it in escaped JSON", () => {
    expect(gpxIn(String.raw`\"gpxUrl\":\"/gpx/rysy.gpx\"`)).toBe("/gpx/rysy.gpx");
  });
  it("is null without one", () => {
    expect(gpxIn("<html></html>")).toBeNull();
  });
});
