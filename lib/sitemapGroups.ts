/** The sitemap groups (app/sitemaps/sitemap.ts), one per page type: trips, towns, home + info pages. */
export const SITEMAP_GROUPS = ["trasy", "mesta", "info"] as const;
export type SitemapGroup = (typeof SITEMAP_GROUPS)[number];

/** The sitemap index at /sitemap.xml, the address robots.txt, Search Console and Bing already know. */
export function sitemapIndex(url: (path: string) => string): string {
  const items = SITEMAP_GROUPS.map((id) => `  <sitemap><loc>${url(`/sitemaps/sitemap/${id}.xml`)}</loc></sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}
