/**
 * "Na trase": the huts, food places, viewpoints, springs, shelters and castles along a walk, as plain text for the
 * question row. Names come from OpenStreetMap and are noisy (private cottages tagged as huts, a hotel as a shelter,
 * the same place twice), so the list is filtered before anything is said. Never a word about opening hours.
 * Pure functions; the km come from the places' `along_m` (lib/data.ts), measured on the walk's own path.
 */
import { haversineM } from "@/lib/geo";
import { decimal, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import type { Poi, PoiKind } from "@/lib/types";
import { foodKind } from "@/lib/food";

/** Same name and kind closer than this is one place (OSM often has the node and the building). */
const DEDUPE_M = 300;
/** At most this many places are named; the rest are counted. */
export const MAX_PLACES = 8;
/** At most this many food places are named (they are most of the places in a village). */
export const MAX_FOOD = 3;

/** A place that is worth naming, with where it is on the walk. */
export interface RoutePlace {
  kind: PoiKind;
  /** Name for people; null when the name is noise (a spring called "Irena") and only the kind is said. */
  name: string | null;
  /** The word for the kind in Slovak: "chata", "reštaurácia", "prameň". */
  word: string;
  /** Metres from the start along the walk; null when unknown. */
  along_m: number | null;
  /** Side trip there and back, minutes; null = on the walk. */
  detour_min: number | null;
  location: Poi["location"];
}

export interface RoutePlaces {
  on: RoutePlace[];
  off: RoutePlace[];
  /** Places left out of `on`/`off` by the cap. */
  hidden: number;
}

const HUT_WORD = /chat|[uú]tul|ref[uú]gi|bivak|horár|salaš|koliba|zrub|hostinec|hotel|penzi[oó]n|horsk/i;
const SPRING_WORD = /pramen|studn|vyvier|[zž]riedl|pitn|potok/i;

/** Single first names and other one-word names say nothing (and are mostly private cottages). */
function noisyName(kind: PoiKind, name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (kind === "chata" || kind === "utulna") {
    if (kind === "utulna" && /^hotel\b/i.test(name)) return true;
    return words.length < 2 && !HUT_WORD.test(name);
  }
  if (kind === "pramen") return words.length < 2 && !SPRING_WORD.test(name);
  return false;
}

function wordOf(p: Poi): string {
  if (p.kind === "obcerstvenie") {
    const f = foodKind(p.name, p.food);
    return f === "restauracia" ? "reštaurácia" : f === "kaviaren" ? "kaviareň" : "bufet";
  }
  return { vyhliadka: "vyhliadka", chata: "chata", pramen: "prameň", hrad: "hrad", ihrisko: "ihrisko", utulna: "útulňa", obcerstvenie: "bufet" }[p.kind];
}

/** Kinds worth a line here (playgrounds belong to the stops list, not to this one). */
const KINDS = new Set<PoiKind>(["chata", "utulna", "obcerstvenie", "vyhliadka", "pramen", "hrad"]);

/** The places to name: noise removed, duplicates merged, on-walk ones in walking order, then side trips by detour. */
export function pickRoutePlaces(pois: Poi[], max = MAX_PLACES): RoutePlaces {
  const kept: RoutePlace[] = [];
  for (const p of pois) {
    if (!KINDS.has(p.kind)) continue;
    const raw = (p.name ?? "").trim();
    // Unnamed: a spring is still a spring (water), anything else says nothing.
    if (!raw && p.kind !== "pramen") continue;
    const noisy = !raw || noisyName(p.kind, raw);
    if (noisy && p.kind !== "pramen") continue;
    const name = noisy ? null : raw;
    const twin = kept.some((k) => k.kind === p.kind && (k.name ?? "").toLowerCase() === (name ?? "").toLowerCase() && haversineM(k.location, p.location) < DEDUPE_M);
    if (twin) continue;
    kept.push({ kind: p.kind, name, word: wordOf(p), along_m: p.along_m, detour_min: p.detour_min, location: p.location });
  }
  const byAlong = (a: RoutePlace, b: RoutePlace) => (a.along_m ?? 0) - (b.along_m ?? 0);
  const on = kept.filter((k) => k.detour_min === null).sort(byAlong);
  const off = kept.filter((k) => k.detour_min !== null).sort((a, b) => (a.detour_min ?? 0) - (b.detour_min ?? 0) || byAlong(a, b));
  // Food places are the most common and would crowd out the rest: at most MAX_FOOD, the ones the walk reaches first.
  let food = 0;
  const notCrowded = (k: RoutePlace) => k.kind !== "obcerstvenie" || ++food <= MAX_FOOD;
  const onKept = on.filter(notCrowded);
  const offKept = off.filter(notCrowded);
  const onShown = onKept.slice(0, max);
  const offShown = offKept.slice(0, Math.max(0, max - onShown.length));
  return { on: onShown, off: offShown, hidden: on.length + off.length - onShown.length - offShown.length };
}

/** Whether the walk itself passes water or a place to buy it: a spring, a hut or a food place (not a side trip). */
export function waterOnWalk(pois: Poi[]): boolean {
  return pois.some((p) => p.detour_min === null && (p.kind === "pramen" || p.kind === "chata" || p.kind === "obcerstvenie"));
}

/** Whether the walk itself passes a place to eat (a food place or a hut, not a side trip). */
export function foodOnWalk(pois: Poi[]): boolean {
  return pois.some((p) => p.detour_min === null && (p.kind === "obcerstvenie" || p.kind === "chata"));
}

/** "chata Kamenná chata pod Chopkom" would repeat itself: the kind word is added only when the name does not say it. */
function label(lang: Lang, p: RoutePlace): string {
  const word = tr(lang, p.word);
  if (!p.name) return word;
  return p.name.toLowerCase().includes(p.word.slice(0, 4)) ? p.name : `${word} ${p.name}`;
}

const kmText = (lang: Lang, m: number | null) => {
  if (m === null) return "";
  if (m < 150) return tr(lang, "pri štarte");
  return tr(lang, "pri {km}", { km: `${decimal(lang, m / 1000)} km` });
};

/** "Kamenná chata pod Chopkom, pri 4,5 km". */
export function placeText(lang: Lang, p: RoutePlace): string {
  const where = p.detour_min === null ? kmText(lang, p.along_m) : tr(lang, "+{n} min odbočka", { n: p.detour_min });
  return where ? `${label(lang, p)}, ${where}` : label(lang, p);
}

/** One line for the folded row: the first few on-walk places by name; only side trips: say so. Null = nothing worth naming. */
export function onRouteTeaser(lang: Lang, r: RoutePlaces): string | null {
  if (r.on.length === 0 && r.off.length === 0) return null;
  if (r.on.length > 0) {
    const names = r.on.slice(0, 3).map((p) => label(lang, p));
    const rest = r.on.length - names.length + r.off.length;
    return names.join(", ") + (rest > 0 ? " " + tr(lang, "a ďalšie {n}", { n: rest }) : "");
  }
  return tr(lang, "Len kúsok bokom: {names}", { names: r.off.slice(0, 2).map((p) => label(lang, p)).join(", ") });
}
