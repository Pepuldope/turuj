import type { MetadataRoute } from "next";
import { getAllTrips, getTripLastmod, getTripPhoto, getTripVariants } from "@/lib/tripFiles";
import { EN_TRIPS_AHEAD, absoluteUrl } from "@/lib/site";
import { getTowns } from "@/lib/trips";
import { SATELLITE_TOWNS } from "@/lib/townTrips";
import { bothLanguages, tripEntries } from "@/lib/sitemapEntries";
import { SITEMAP_GROUPS, type SitemapGroup } from "@/lib/sitemapGroups";

// Built once per deploy (every push to main, including the weekly trip refresh), so new
// trips appear without touching this file and the Worker never re-reads the index for it.
export const dynamic = "force-static";

const INFO_PAGES = ["/ako-to-funguje", "/aplikacia", "/o-nas", "/napiste-nam", "/poslat-fotku", "/nahlasit-chybu", "/zdroje", "/sukromie", "/pristupnost", "/podmienky", "/upozornenie", "/uzavery", "/uzavery/tanap"];

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
    // Best known first, each place's other routes right after it (only those of well-known places, lib/variantTitles.ts).
    // Next.js writes `images` as <image:image> (namespace included); only built once per deploy (force-static
    // above), so the photo lookups and the two data files (read from the disk, never bundled) cost the Worker nothing.
    const mains = [...(await getAllTrips())].sort((a, b) => b.rank - a.rank);
    const photos = await Promise.all(mains.map((t) => getTripPhoto(t.slug, t.destination.osm)));
    const photoUrls = Object.fromEntries(mains.map((t, i) => [t.slug, photos[i]?.url]));
    // The routes are Slovak only: only main trips are in this set, so they get no /en entry and no `en` alternate.
    return bothLanguages(
      tripEntries(mains, await getTripVariants(), await getTripLastmod(), photoUrls),
      new Set(mains.slice(0, EN_TRIPS_AHEAD).map((t) => t.slug))
    );
  }
  if (id === "mesta") {
    return bothLanguages([
      { url: absoluteUrl("/vylety-z") },
      // Satellite towns are noindex (lib/townTrips.ts SATELLITE_TOWNS), so they're not offered here either.
      ...getTowns()
        .filter((t) => !SATELLITE_TOWNS[t.id])
        .map((t) => ({ url: absoluteUrl(`/vylety-z/${t.id}`) })),
    ]);
  }
  return bothLanguages([
    { url: absoluteUrl("/") },
    ...INFO_PAGES.map((path) => ({ url: absoluteUrl(path) })),
  ]);
}
