import { describe, expect, it } from "vitest";
import { SITEMAP_GROUPS, sitemapIndex } from "./sitemapGroups";

describe("sitemapIndex", () => {
  it("lists one sitemap per page type at the address Next.js gives it", () => {
    const xml = sitemapIndex((p) => `https://turuj.sk${p}`);
    expect(xml).toContain("<sitemapindex");
    for (const id of SITEMAP_GROUPS) expect(xml).toContain(`<loc>https://turuj.sk/sitemaps/sitemap/${id}.xml</loc>`);
  });
});
