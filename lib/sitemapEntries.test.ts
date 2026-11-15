import { describe, expect, it } from "vitest";
import { bothLanguages } from "./sitemapEntries";
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
