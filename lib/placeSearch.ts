// Search by place, not just by trip name: "Železná studnička" finds the trips that start,
// pass or end there, and the places right next to it (Červený most). The index is
// public/data/search.json (pipeline/search.py): every named start, car park, stop, hut,
// spring and sight of every trip, with the trips that touch it.
import type { LatLng } from "@/lib/types";
import { haversineM } from "@/lib/geo";
import { fuzzyScore } from "@/lib/fuzzy";

export interface SearchIndexFile {
  v: number;
  trips: string[];
  places: [name: string, lat: number, lon: number, kind: string, trips: number[]][];
}

export interface SearchPlace {
  name: string;
  key: string;
  location: LatLng;
  kind: string;
  trips: string[];
}

export interface PlaceSearch {
  places: SearchPlace[];
}

export interface PlaceHit {
  place: SearchPlace;
  /** For a place found because it is next to a match: the match it is next to. */
  nextTo?: string;
}

export interface PlaceResults {
  /** Places named like the query, best first, one per name. */
  hits: PlaceHit[];
  /** Places close to the best hits (Červený most next to Železná studnička). */
  near: PlaceHit[];
  /** Every trip that touches a hit or a nearby place. */
  slugs: Set<string>;
}

/** How close a place must be to a match to show up beside it. */
export const NEAR_M = 1000;
const MAX_HITS = 4;
const MAX_NEAR = 4;
/** Next-door places worth naming: where people start, park, get off the bus, or go. Not cafés or playgrounds. */
const NOT_NEAR = new Set(["obcerstvenie", "ihrisko"]);
const WAYPOINTS = new Set(["start", "zastavka", "parkovisko"]);

/** Lower case without accents: "zelezna studnicka" finds "Železná studnička". */
export const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function preparePlaces(file: SearchIndexFile): PlaceSearch {
  return {
    places: file.places.map(([name, lat, lon, kind, trips]) => ({
      name,
      key: plain(name),
      location: { lat, lon },
      kind,
      trips: trips.map((i) => file.trips[i]).filter(Boolean),
    })),
  };
}

function fuzzyPlaces(index: PlaceSearch, words: string[], exact: SearchPlace[]): SearchPlace[] {
  const done = new Set(exact);
  const scored: { p: SearchPlace; d: number }[] = [];
  for (const p of index.places) {
    if (done.has(p)) continue;
    const d = fuzzyScore(words, p.key);
    if (d !== null) scored.push({ p, d });
  }
  return scored.sort((a, b) => a.d - b.d || b.p.trips.length - a.p.trips.length).map((s) => s.p);
}

export function searchPlaces(index: PlaceSearch, words: string[]): PlaceResults {
  const slugs = new Set<string>();
  if (words.length === 0) return { hits: [], near: [], slugs };
  const startsWith = (key: string) => key.startsWith(words[0]) || key.includes(` ${words[0]}`);
  const exact = index.places
    .filter((p) => words.every((w) => p.key.includes(w)))
    .sort((a, b) => Number(startsWith(b.key)) - Number(startsWith(a.key)) || b.trips.length - a.trips.length);
  // Too few names found: forgive a typo or two, ranked below the exact ones, fewest slips first.
  const found = new Set(exact.map((p) => p.key)).size < MAX_HITS ? [...exact, ...fuzzyPlaces(index, words, exact)] : exact;
  for (const p of found.slice(0, 40)) p.trips.forEach((s) => slugs.add(s));

  const hits: PlaceHit[] = [];
  const seen = new Set<string>();
  for (const p of found) {
    if (hits.length >= MAX_HITS) break;
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    hits.push({ place: p });
  }

  // Next to the best matches: every place of those names counts (a spring and its car park
  // 2 km apart both called Železná studnička).
  const anchors = found.filter((p) => hits.slice(0, 2).some((h) => h.place.key === p.key)).slice(0, 12);
  const close: { place: SearchPlace; d: number; nextTo: string }[] = [];
  for (const p of index.places) {
    if (seen.has(p.key) || p.trips.length === 0 || NOT_NEAR.has(p.kind)) continue;
    let best: { d: number; nextTo: string } | null = null;
    for (const a of anchors) {
      const d = haversineM(a.location, p.location);
      if (d <= NEAR_M && (!best || d < best.d)) best = { d, nextTo: a.name };
    }
    if (best) close.push({ place: p, ...best });
  }
  // starts, stops and car parks first (Červený most), then huts, springs and sights, nearest first
  close.sort((a, b) => Number(WAYPOINTS.has(b.place.kind)) - Number(WAYPOINTS.has(a.place.kind)) || a.d - b.d);
  const near: PlaceHit[] = [];
  for (const c of close) {
    if (near.length >= MAX_NEAR) break;
    if (seen.has(c.place.key)) continue;
    seen.add(c.place.key);
    near.push({ place: c.place, nextTo: c.nextTo });
    c.place.trips.forEach((s) => slugs.add(s));
  }
  return { hits, near, slugs };
}
