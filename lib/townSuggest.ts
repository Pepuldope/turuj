// Instant town suggestions for the start search and the trip search. Pure and offline: the towns the
// site already ships (data/towns.json), matched by prefix, ignoring case and accents. (Nominatim
// forbids search-as-you-type, so anything beyond these towns still waits for Enter.)

import { fuzzyScore } from "@/lib/fuzzy";

export interface SuggestTown {
  id: string;
  name: string;
  location: { lat: number; lon: number };
}

/** Lower case, no accents, hyphens as spaces: "Banská-Bystrica" and "banska bystrica" match alike. */
export const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Up to `max` towns whose name starts with the text, or has a word that does ("bystr" finds
 * Banská Bystrica). Names that start with it come first, then the shorter name; needs two letters.
 */
export function suggestTowns<T extends SuggestTown>(query: string, towns: readonly T[], max = 6): T[] {
  const q = foldName(query);
  if (q.length < 2) return [];
  const scored: { town: T; rank: number; key: string }[] = [];
  for (const town of towns) {
    const key = foldName(town.name);
    const rank = key.startsWith(q) ? 0 : key.includes(` ${q}`) ? 1 : -1;
    if (rank >= 0) scored.push({ town, rank, key });
  }
  scored.sort((a, b) => a.rank - b.rank || a.key.length - b.key.length || a.key.localeCompare(b.key, "sk"));
  const out = scored.slice(0, max).map((s) => s.town);
  if (out.length >= max) return out;
  // Too few: forgive a typo ("tranva" finds Trnava), after the exact ones, fewest slips first.
  const exact = new Set(scored.map((s) => s.town));
  const words = q.split(" ");
  const fuzzy: { town: T; d: number; key: string }[] = [];
  for (const town of towns) {
    if (exact.has(town)) continue;
    const key = foldName(town.name);
    const d = fuzzyScore(words, key);
    if (d !== null) fuzzy.push({ town, d, key });
  }
  fuzzy.sort((a, b) => a.d - b.d || a.key.length - b.key.length || a.key.localeCompare(b.key, "sk"));
  return [...out, ...fuzzy.slice(0, max - out.length).map((f) => f.town)];
}
