import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { langPath } from "@/lib/lang";

/**
 * Every page in Slovak and in English (/en), each pointing to the other (hreflang). English trip
 * pages are listed only for the trips built ahead (app/en/trasa/[slug]): a search engine reading
 * the rest would draw each one on the free Worker.
 */
export function bothLanguages(entries: MetadataRoute.Sitemap, englishTrips?: Set<string>): MetadataRoute.Sitemap {
  return entries.flatMap((e) => {
    const path = e.url.slice(absoluteUrl("/").length - 1);
    const languages = { sk: absoluteUrl(path), en: absoluteUrl(langPath("en", path)) };
    const trip = /^\/trasa\/(.+)$/.exec(path)?.[1];
    // A trip without an indexable English page has no `en` alternate: it would point at a noindex page.
    if (trip && englishTrips && !englishTrips.has(trip)) return [{ ...e, alternates: { languages: { sk: languages.sk } } }];
    return [
      { ...e, alternates: { languages } },
      { ...e, url: languages.en, alternates: { languages } },
    ];
  });
}

