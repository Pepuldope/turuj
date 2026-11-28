/**
 * The strip of well-known trips at the top of the home page (C155, Peter 14 Nov: option C; the seasonal row of
 * C66 merged in, C156). The rule for "well-known": the trip's popularity rank (0-100, from OSM and Wikipedia
 * signals, the same number that colours the map) is at least KNOWN_RANK, the day fits it (open, back before
 * dark), and in the dark months it is a short one. With a start, only trips within reach, the better known a
 * little ahead of the nearer ones.
 */
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

/** About the best known tenth of the trips (rank 70 = place ~200 of ~2,150 on 28 Nov 2026). */
export const KNOWN_RANK = 70;
/** Cards in the strip. Fewer than MIN_SHOWN fitting trips: no strip, the list says it all. */
export const STRIP_MAX = 8;
export const MIN_SHOWN = 3;
/** Within reach of the start (minutes there by car, or by bus/train). Too few within it: the wider reach. */
const REACH_MIN = 90;
const WIDE_REACH_MIN = 150;
/** Each minute further away costs this many points of rank. 0.3: a trip 30 min further must be 9 points better known. */
const RANK_PER_MIN = 0.3;

/** Longest walk (minutes, there and back) the strip picks in each month (1-12); null = any. */
const MONTH_WALK_CAP: Record<number, number | null> = {
  1: 240, 2: 240, 3: 300, 4: 360, 5: null, 6: null, 7: null, 8: null, 9: null, 10: 360, 11: 240, 12: 240,
};

const MONTH_SK = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The strip's title for a month (1-12): what the picks have in common, said in a few words. */
export function knownTitle(month: number, lang: Lang): string {
  const cap = MONTH_WALK_CAP[month];
  const vars = { month: (lang === "en" ? MONTH_EN : MONTH_SK)[month - 1] };
  if (cap !== null && cap <= 240) return tr(lang, "Známe výlety na {month}: krátke, späť za svetla", vars);
  if (cap !== null) return tr(lang, "Známe výlety na {month}: kratšie, kým sú dni krátke", vars);
  return tr(lang, "Známe výlety na {month}", vars);
}

export interface KnownCandidate {
  rank: number;
  /** Walk in minutes, as the card shows it. */
  hikeMin: number;
  /** Minutes there (car, or bus/train); null without a start or without a time. */
  driveMin: number | null;
  /** Open that day and back before dark. */
  fits: boolean;
  /** On the list only through a longer route than its main one. */
  viaLonger: boolean;
}

/** The strip's trips, best first. `hasStart`: a start is set, so only trips within reach count. */
export function pickKnown<T extends KnownCandidate>(items: readonly T[], month: number, hasStart: boolean): T[] {
  const cap = MONTH_WALK_CAP[month];
  const base = items.filter((i) => i.fits && !i.viaLonger && i.rank >= KNOWN_RANK && (cap === null || i.hikeMin <= cap));
  if (!hasStart) return [...base].sort((a, b) => b.rank - a.rank).slice(0, STRIP_MAX);
  const within = (max: number) => base.filter((i) => i.driveMin !== null && i.driveMin <= max);
  let near = within(REACH_MIN);
  if (near.length < MIN_SHOWN) near = within(WIDE_REACH_MIN);
  const score = (i: T) => i.rank - RANK_PER_MIN * (i.driveMin ?? 0);
  return near.sort((a, b) => score(b) - score(a)).slice(0, STRIP_MAX);
}
