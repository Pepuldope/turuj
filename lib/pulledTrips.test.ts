import { describe, expect, it } from "vitest";
import pulledList from "../data/pulled-trips.json";
import { pulledHtml, pulledResponse, pulledSlug } from "./pulledTrips";

const slugs = ["vrsatec-od-auta"];
const get = (path: string, method = "GET") => new Request(`https://turuj.sk${path}`, { method });

describe("pulledSlug", () => {
  it("catches the trip's page, its sub-pages and the English ones", () => {
    for (const p of ["/trasa/vrsatec-od-auta", "/en/trasa/vrsatec-od-auta", "/trasa/vrsatec-od-auta/cesty", "/en/trasa/vrsatec-od-auta/okruh", "/trasa/vrsatec-od-auta/"])
      expect(pulledSlug(p, slugs), p).toBe("vrsatec-od-auta");
  });

  it("leaves other trips alone, even with a shared prefix", () => {
    for (const p of ["/trasa/vrsatec-cerveny-kamen", "/trasa/vrsatec", "/trasa/vrsatec-od-auta-2", "/vylety-z/vrsatec-od-auta", "/", "/trasa/vrsatec-od-auta/x"])
      expect(pulledSlug(p, slugs), p).toBeNull();
  });

  it("does nothing with an empty list, and shipped list is empty", () => {
    expect(pulledSlug("/trasa/vrsatec-od-auta", [])).toBeNull();
    expect(pulledList).toEqual([]);
  });
});

describe("pulledResponse", () => {
  it("answers 503 with noindex and links home and to the disclaimer", async () => {
    const res = pulledResponse(get("/trasa/vrsatec-od-auta"), slugs)!;
    expect(res.status).toBe(503);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(res.headers.get("Retry-After")).toBe("86400");
    const html = await res.text();
    expect(html).toContain("Tento výlet je dočasne stiahnutý");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/upozornenie"');
    expect(html).toContain('content="noindex"');
  });

  it("speaks English under /en and links to the English pages", async () => {
    const html = await pulledResponse(get("/en/trasa/vrsatec-od-auta"), slugs)!.text();
    expect(html).toContain('lang="en"');
    expect(html).toContain('href="/en/upozornenie"');
    expect(pulledHtml(true)).toBe(html);
  });

  it("ignores other methods and other pages", () => {
    expect(pulledResponse(get("/trasa/vrsatec-od-auta", "POST"), slugs)).toBeNull();
    expect(pulledResponse(get("/trasa/other"), slugs)).toBeNull();
    expect(pulledResponse(get("/trasa/vrsatec-od-auta", "HEAD"), slugs)?.status).toBe(503);
  });
});
