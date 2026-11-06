import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { routeWalk, trailDetailFrom } from "@/lib/data";
import { pickWalk } from "@/lib/walkFacts";
import { getTripLive } from "@/lib/tripDb";
import { englishTripsAhead, getTripPhoto, shareImage } from "@/lib/tripFiles";
import { formatDistance, formatDuration } from "@/lib/format";
import { TripSheet } from "@/components/TripSheet";
import { pageMetadata } from "@/lib/seo";
import { metaDescription } from "@/lib/describeSk";
import { langPath, tr } from "@/lib/lang";
import { nearestTown } from "@/lib/trips";
import { townFrom } from "@/lib/townNames";
import type { Lang } from "@/lib/lang";

/** One database read per request, shared by the metadata and the page. */
const loadTrip = cache(async (slug: string) => {
  const { trip } = await getTripLive(slug);
  return trip ? { trip, detail: trailDetailFrom(trip) } : null;
});

export async function tripMetadata(slug: string, lang: Lang): Promise<Metadata> {
  const loaded = await loadTrip(slug);
  const detail = loaded?.detail;
  if (!loaded || !detail) return { title: tr(lang, "Trasa sa nenašla"), robots: { index: false } };
  const { trail } = detail;
  const { trip } = loaded;
  const photo = await getTripPhoto(trail.slug, trip.destination.osm);
  // The same walk as the page's facts (from the default parking), so search results don't show another number.
  const w = pickWalk(routeWalk(detail), false, detail.parkingLots.length > 0);
  // One distance for the title and the description: the walk the page shows, not the bare trail's.
  const km = formatDistance(w?.m ?? trail.distance_m, lang);
  const facts = tr(lang, "{km}, +{up} m, {t} chôdze", { km, up: w?.ascentM ?? trail.ascent_m, t: formatDuration(w?.min ?? trail.duration_min) });
  const town = nearestTown(trip.start.location);
  return pageMetadata({
    // Most places have several routes, one page each: the other routes' pages carry their start in
    // the title, so search results tell them apart (6,200 of 6,466 pages shared a title before).
    // People search "výlet na Devín", "výlety z Bratislavy": the place, then the nearest town
    // (Peter 2026-10-30). The longest wording that fits 60 characters (Ahrefs 2 Nov).
    title: fitTitle(
      trip.variant_of
        ? [
            tr(lang, "{name} zo štartu {start} ({km}) – výlet", { name: trail.name, start: trip.start.name, km }),
            tr(lang, "{name} zo štartu {start} ({km})", { name: trail.name, start: trip.start.name, km }),
          ]
        : [
            ...(town
              ? [
                  tr(lang, "{name} – výlet {from}: túra, parkovanie", { name: trail.name, from: townFrom(lang, town.id, town.name) }),
                  tr(lang, "{name} – výlet {from}", { name: trail.name, from: townFrom(lang, town.id, town.name) }),
                ]
              : []),
            tr(lang, "{name} – výlet a túra", { name: trail.name }),
          ]
    ),
    description:
      lang === "sk"
        ? metaDescription(trip, facts)
        : tr(lang, "{name}: {facts}. Kde zaparkovať, kedy najneskôr vyraziť a stihnúť návrat za svetla.", { name: trail.name, facts }),
    path: `/trasa/${trail.slug}`,
    // No " | Túruj": search results show the site name on their own, and the place names are long
    // enough already (Ahrefs 2 Nov: 999 titles over its 60-character mark).
    absoluteTitle: true,
    lang,
    english: (await englishTripsAhead()).has(trail.slug),
    // Shared links and search results show the place itself when Commons has a photo of it.
    ...(photo ? { image: { ...shareImage(photo), alt: trail.name } } : {}),
  });
}

const MAX_TITLE = 60;

/** The first title that fits search results' width, else the shortest (the last). */
function fitTitle(candidates: string[]): string {
  return candidates.find((t) => t.length <= MAX_TITLE) ?? candidates[candidates.length - 1];
}

function plainSlug(slug: string): string {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    // Not encoded.
  }
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The trip page (app/trasa/[slug] and app/en/trasa/[slug]). */
export async function TripRoute({ slug, lang }: { slug: string; lang: Lang }) {
  const loaded = await loadTrip(slug);
  if (!loaded) {
    // A typed or pasted name ("Kriváň", "velky choc") still finds the trip.
    const plain = plainSlug(slug);
    if (plain !== slug && (await loadTrip(plain))) permanentRedirect(langPath(lang, `/trasa/${plain}`));
    notFound();
  }
  const { trip, detail } = loaded;
  return <TripSheet trip={trip} detail={detail} lang={lang} />;
}
