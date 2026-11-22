import { describe, expect, it } from "vitest";
import { bothLanguages, tripEntries } from "./sitemapEntries";
import type { TripSummary } from "./tripSchema";
import { absoluteUrl } from "./site";

const trip = (slug: string) => ({ url: absoluteUrl(`/trasa/${slug}`) });

describe("bothLanguages", () => {
  it("gives a trip with an English page both entries and both alternates", () => {
    const out = bothLanguages([trip("a")], new Set(["a"]));
    expect(out).toHaveLength(2);
    expect(Object.keys(out[0].alternates?.languages ?? {})).toEqual(["sk", "en"]);
  });

  it("gives a trip without an English page one entry that only declares sk", () => {
    const out = bothLanguages([trip("b")], new Set(["a"]));
    expect(out).toHaveLength(1);
    expect(out[0].alternates?.languages).toEqual({ sk: absoluteUrl("/trasa/b") });
  });

  it("leaves non-trip pages in both languages", () => {
    const out = bothLanguages([{ url: absoluteUrl("/o-nas") }], new Set());
    expect(out).toHaveLength(2);
    expect(out[1].alternates?.languages?.en).toBe(out[1].url);
  });
});

// Only the fields tripEntries reads.
const summary = (slug: string, rank: number, extra: Partial<TripSummary> = {}) =>
  ({ slug, rank, duration_min: 60, ...extra }) as TripSummary;

describe("tripEntries", () => {
  const mains = [summary("low", 40), summary("krivan", 90), summary("rysy", 95)];
  const variants = [
    summary("krivan-long", 90, { variant_of: "krivan", duration_min: 300 }),
    summary("krivan-short", 90, { variant_of: "krivan", duration_min: 120 }),
    summary("low-other", 40, { variant_of: "low" }),
  ];
  const dates = { krivan: "2026-11-02", "krivan-short": "2026-10-26", rysy: "2026-11-16" };
  const slugs = (out: { url: string }[]) => out.map((e) => e.url.split("/trasa/")[1]);

  it("lists the variants of a well-known place and leaves out those of a lower one", () => {
    const out = slugs(tripEntries(mains, variants, dates, {}));
    expect(out).toContain("krivan-short");
    expect(out).not.toContain("low-other");
  });

  it("puts a variant right after its main, mains best known first, variants shortest first", () => {
    expect(slugs(tripEntries(mains, variants, dates, {}))).toEqual(["rysy", "krivan", "krivan-short", "krivan-long", "low"]);
  });

  it("sets lastModified from the dates and leaves it out when a trip has none", () => {
    const out = tripEntries(mains, variants, dates, {});
    expect(out.find((e) => e.url.endsWith("/krivan"))?.lastModified).toBe("2026-11-02");
    expect(out.find((e) => e.url.endsWith("/krivan-long"))).not.toHaveProperty("lastModified");
  });

  it("carries no changeFrequency or priority", () => {
    for (const e of tripEntries(mains, variants, dates, {})) {
      expect(e).not.toHaveProperty("changeFrequency");
      expect(e).not.toHaveProperty("priority");
    }
  });

  it("gives a variant only the sk alternate and no /en entry, its English-ready main both, with the same date", () => {
    const out = bothLanguages(tripEntries(mains, variants, dates, {}), new Set(["krivan", "rysy", "low"]));
    const short = out.filter((e) => e.url.includes("krivan-short"));
    expect(short).toHaveLength(1);
    expect(short[0].url).toBe(absoluteUrl("/trasa/krivan-short"));
    expect(short[0].alternates?.languages).toEqual({ sk: absoluteUrl("/trasa/krivan-short") });
    const krivan = out.filter((e) => e.url.endsWith("/krivan"));
    expect(krivan).toHaveLength(2);
    expect(krivan.map((e) => e.lastModified)).toEqual(["2026-11-02", "2026-11-02"]);
  });

  it("lists a variant with its place's own photo copy only", () => {
    const out = tripEntries(mains, variants, dates, { krivan: "/photos/c/krivan.jpg", rysy: "https://commons.example/x.jpg" });
    expect(out.find((e) => e.url.endsWith("/krivan-short"))?.images).toEqual([absoluteUrl("/photos/c/krivan.jpg")]);
    expect(out.find((e) => e.url.endsWith("/rysy"))).not.toHaveProperty("images");
  });
});
