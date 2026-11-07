/**
 * Place search via Nominatim (OpenStreetMap). Free, no key.
 *
 * Usage policy: max 1 request/s and NO search-as-you-type autocomplete, so we
 * only search when the user submits. https://operations.osmfoundation.org/policies/nominatim/
 */
import { haversineM } from "@/lib/geo";

export interface Place {
  lat: number;
  lon: number;
  /** Short Slovak label, e.g. "Pezinok, okres Pezinok". */
  label: string;
  /** Country as Nominatim names it (the last part of its address), when known. */
  country?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5" +
    "&countrycodes=sk,cz,at,hu,pl&accept-language=sk" +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const rows = (await res.json()) as NominatimResult[];
  return tidyPlaces(rows.map((r) => {
    const parts = r.display_name.split(", ");
    const head = r.name || parts[0];
    const rest = parts.filter((p) => p !== head).slice(0, 2);
    return {
      lat: Number(r.lat),
      lon: Number(r.lon),
      label: [head, ...rest].join(", "),
      country: parts.length > 1 ? parts[parts.length - 1] : undefined,
    };
  }));
}

interface NominatimReverse {
  address?: { city?: string; town?: string; village?: string; municipality?: string; suburb?: string };
}

/**
 * GPS position -> the town's name ("Pezinok"), so the start reads as a place
 * and can go into a shared plan without coordinates. One request per fix.
 */
export async function reverseTown(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=sk" +
    `&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const { address: a } = (await res.json()) as NominatimReverse;
  return a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? null;
}

const COUNTRY_RANK = (c?: string) => (c === "Slovensko" || c === "Slovakia" ? 0 : 1);

/**
 * The search results as people want them: the same place listed twice (Nominatim often returns a
 * town and its municipality) collapses to one when it has the same name and region within 2 km, and
 * Slovakia comes before the neighbours. Keeps Nominatim's order otherwise.
 */
export function tidyPlaces(places: Place[]): Place[] {
  const kept: Place[] = [];
  for (const p of places) {
    const twin = kept.some((k) => k.label === p.label && haversineM(k, p) < 2000);
    if (!twin) kept.push(p);
  }
  return kept
    .map((p, i) => ({ p, i }))
    .sort((a, b) => COUNTRY_RANK(a.p.country) - COUNTRY_RANK(b.p.country) || a.i - b.i)
    .map((x) => x.p);
}
