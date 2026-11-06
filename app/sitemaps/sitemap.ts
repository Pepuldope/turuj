import type { MetadataRoute } from "next";
import { getAllTrails } from "@/lib/tripFiles";
import { EN_TRIPS_AHEAD, absoluteUrl } from "@/lib/site";
import { getTowns } from "@/lib/trips";
import { langPath } from "@/lib/lang";
import { SITEMAP_GROUPS, type SitemapGroup } from "@/lib/sitemapGroups";

// Built once per deploy (every push to main, including the weekly trip refresh), so new
// trips appear without touching this file and the Worker never re-reads the index for it.
export const dynamic = "force-static";

const INFO_PAGES = ["/ako-to-funguje", "/aplikacia", "/o-nas", "/napiste-nam", "/nahlasit-chybu", "/zdroje", "/sukromie", "/podmienky", "/upozornenie", "/uzavery", "/uzavery/tanap"];

/**
 * Every page in Slovak and in English (/en), each pointing to the other (hreflang). English trip
 * pages are listed only for the trips built ahead (app/en/trasa/[slug]): a search engine reading
 * the rest would draw each one on the free Worker.
 */
function bothLanguages(entries: MetadataRoute.Sitemap, englishTrips?: Set<string>): MetadataRoute.Sitemap {
  return entries.flatMap((e) => {
    const path = e.url.slice(absoluteUrl("/").length - 1);
    const languages = { sk: absoluteUrl(path), en: absoluteUrl(langPath("en", path)) };
    const trip = /^\/trasa\/(.+)$/.exec(path)?.[1];
    return [
      { ...e, alternates: { languages } },
      ...(trip && englishTrips && !englishTrips.has(trip) ? [] : [{ ...e, url: languages.en, alternates: { languages } }]),
    ];
  });
}

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
    const trails = await getAllTrails();
    return bothLanguages(
      trails.map(({ trail }) => ({ url: absoluteUrl(`/trasa/${trail.slug}`), changeFrequency: "weekly" as const, priority: 0.8 })),
      new Set(trails.slice(0, EN_TRIPS_AHEAD).map(({ trail }) => trail.slug))
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
