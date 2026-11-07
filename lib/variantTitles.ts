/**
 * Titles and the H1 of a route variant's page (C39): "Kriváň z Troch Studničiek" instead of "Kriváň zo
 * štartu Tri Studničky", and when the Slovak case of the start is not certain, "Kriváň – štart: Tri
 * Studničky". Only the variants that are indexed get this (A02 = C, settled 6 Nov): the variants under
 * the places with rank >= INDEXED_VARIANT_RANK; the rest keep the old wording and are meant to canonical
 * to the main page (C43, not built yet: this file only decides who gets the new heading).
 */
import { fromStart } from "@/lib/slovakCase";
import type { TripSummary } from "@/lib/tripSchema";

/** Places at least this well known have their route variants indexed (about 200 places, 500 variants). */
export const INDEXED_VARIANT_RANK = 70;

const places = new WeakMap<readonly TripSummary[], Set<string>>();

/** Slugs of the main trips whose variants are indexed. `mains` must be the same array between calls to reuse the set. */
export function indexedVariantPlaces(mains: readonly TripSummary[]): Set<string> {
  let s = places.get(mains);
  if (!s) {
    s = new Set(mains.filter((t) => !t.variant_of && t.rank >= INDEXED_VARIANT_RANK).map((t) => t.slug));
    places.set(mains, s);
  }
  return s;
}

/** Is this trip an indexed variant (a variant of a place that is well known)? */
export function isIndexedVariant(trip: Pick<TripSummary, "variant_of">, mains: readonly TripSummary[]): boolean {
  return !!trip.variant_of && indexedVariantPlaces(mains).has(trip.variant_of);
}

export interface VariantHeading {
  /** The distinct H1 and the base of the title. */
  h1: string;
  /** Title candidates, longest first (the caller takes the first that fits). */
  titles: string[];
  confident: boolean;
}

/** "Kriváň z Troch Studničiek", else "Kriváň – štart: Tri Studničky". */
export function variantHeading(name: string, start: string, km: string): VariantHeading {
  const from = fromStart(start);
  const h1 = from ? `${name} ${from}` : `${name} – štart: ${start}`;
  return { h1, titles: [`${h1} (${km}) – výlet`, `${h1} (${km})`, h1], confident: from !== null };
}
