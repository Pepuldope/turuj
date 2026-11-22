import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { langPath } from "@/lib/lang";
import { indexedVariantPlaces } from "@/lib/variantTitles";
import type { TripSummary } from "@/lib/tripSchema";

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


/**
 * The image sitemap entry (`images`) for a trip's photo: only our own copy (/photos/c/, made by
 * scripts/fetch-photos.mjs), since a Commons URL is not ours to claim. Undefined when there is none.
 */
export function ownImages(photoUrl: string | null | undefined): string[] | undefined {
  return photoUrl?.startsWith("/photos/c/") ? [absoluteUrl(photoUrl)] : undefined;
}

/**
 * The trip entries of the sitemap: the main trips best known first, each followed by its other routes
 * when its place is well known enough to have them indexed (lib/variantTitles.ts), shortest first.
 * `lastModified` is the day the trip's file last changed (pipeline/lastmod.py); a trip without a date
 * gets none rather than a made-up one. A route has no photo of its own to claim, so it lists its
 * place's. No `changeFrequency` or `priority`: Google ignores both.
 */
export function tripEntries(
  mains: readonly TripSummary[],
  variants: readonly TripSummary[],
  dates: Readonly<Record<string, string>>,
  photoUrls: Readonly<Record<string, string | null | undefined>>
): MetadataRoute.Sitemap {
  const indexed = indexedVariantPlaces(mains);
  const byPlace = new Map<string, TripSummary[]>();
  for (const v of variants) {
    if (!v.variant_of || !indexed.has(v.variant_of)) continue;
    byPlace.set(v.variant_of, [...(byPlace.get(v.variant_of) ?? []), v]);
  }
  const entry = (t: TripSummary, photoOf: string): MetadataRoute.Sitemap[number] => {
    const images = ownImages(photoUrls[photoOf]);
    return {
      url: absoluteUrl(`/trasa/${t.slug}`),
      ...(dates[t.slug] ? { lastModified: dates[t.slug] } : {}),
      ...(images ? { images } : {}),
    };
  };
  return [...mains]
    .sort((a, b) => b.rank - a.rank)
    .flatMap((m) => [
      entry(m, m.slug),
      ...(byPlace.get(m.slug) ?? []).sort((a, b) => a.duration_min - b.duration_min).map((v) => entry(v, m.slug)),
    ]);
}
