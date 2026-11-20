import type { MetadataRoute } from "next";
import { getAllTrips, getTripPhoto } from "@/lib/tripFiles";
import { EN_TRIPS_AHEAD, absoluteUrl } from "@/lib/site";
import { getTowns } from "@/lib/trips";
import { bothLanguages, ownImages } from "@/lib/sitemapEntries";
import { SITEMAP_GROUPS, type SitemapGroup } from "@/lib/sitemapGroups";

// Built once per deploy (every push to main, including the weekly trip refresh), so new
// trips appear without touching this file and the Worker never re-reads the index for it.
export const dynamic = "force-static";

const INFO_PAGES = ["/ako-to-funguje", "/aplikacia", "/o-nas", "/napiste-nam", "/nahlasit-chybu", "/zdroje", "/sukromie", "/pristupnost", "/podmienky", "/upozornenie", "/uzavery", "/uzavery/tanap"];

/**
 * One sitemap per page type (/sitemaps/sitemap/trasy.xml, …/mesta.xml, …/info.xml), listed by the
 * index at /sitemap.xml, so Search Console and Bing show how many of each type are indexed.
 */
export async function generateSitemaps() {
  return SITEMAP_GROUPS.map((id) => ({ id }));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = (await props.id) as SitemapGroup;
  if (id === "trasy") {
    // Best known first. Next.js writes `images` as <image:image> (namespace included); only built once per
    // deploy (force-static above), so the photo lookups cost the Worker nothing at run time.
    const trips = [...(await getAllTrips())].sort((a, b) => b.rank - a.rank);
    const photos = await Promise.all(trips.map((t) => getTripPhoto(t.slug, t.destination.osm)));
    return bothLanguages(
      trips.map((t, i) => ({ url: absoluteUrl(`/trasa/${t.slug}`), changeFrequency: "weekly" as const, priority: 0.8, images: ownImages(photos[i]?.url) })),
      new Set(trips.slice(0, EN_TRIPS_AHEAD).map((t) => t.slug))
    );
  }
  if (id === "mesta") {
    return bothLanguages([
      { url: absoluteUrl("/vylety-z"), changeFrequency: "weekly" as const, priority: 0.6 },
      ...getTowns().map((t) => ({ url: absoluteUrl(`/vylety-z/${t.id}`), changeFrequency: "weekly" as const, priority: 0.6 })),
    ]);
  }
  return bothLanguages([
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    ...INFO_PAGES.map((path) => ({ url: absoluteUrl(path), changeFrequency: "yearly" as const, priority: 0.2 })),
  ]);
}
