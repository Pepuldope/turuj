import { getAllTrips, getCarWalks, getPhotos, getTownDrives } from "@/lib/tripFiles";
import type { PlacePhoto } from "@/lib/tripFiles";
import { haversineM } from "@/lib/geo";
import { monthDayOf, todayMonthDay } from "@/lib/closedToday";
import { HOLIDAY_MIN_TILES, HOLIDAY_TILES, fitsHoliday, holidayLeaveBy, holidayShown, holidaySunset, holidayYear } from "@/lib/holidayBlock";
import { wallClock } from "@/lib/zoned";
import { closureRulesFor, getTowns } from "@/lib/trips";
import { seasonDateIn } from "@/lib/closures";
import type { Lang } from "@/lib/lang";
import type { DestinationKind, Town, TripSummary } from "@/lib/tripSchema";

/** How far a town page reaches by car. */
export const TOWN_MAX_MIN = 90;

/** A trip starting this close to the town centre is "in town". */
const IN_TOWN_M = 5000;

/** Tiles per row; the rest are on the map. */
const PER_ROW = 10;

/** A town worth a home-page button: at least this many well-known trips within half an hour. */
const KNOWN_TRIPS = 3;
const KNOWN_RANK = 70;
const KNOWN_MIN = 30;

/** The biggest towns, shown first in the town list. */
export const BIG_TOWNS = ["bratislava", "kosice", "presov", "zilina", "nitra", "banska-bystrica", "trnava", "trencin", "martin", "poprad"];

/** Rows of a town page after "V meste", by what the trip leads to. */
const KIND_ROWS: { title: string; kinds: DestinationKind[] }[] = [
  { title: "Hrady a zrúcaniny", kinds: ["hrad"] },
  { title: "Vrcholy", kinds: ["vrchol"] },
  { title: "Vyhliadky", kinds: ["vyhliadka"] },
  { title: "Jaskyne, plesá a vodopády", kinds: ["jaskyna", "pleso", "vodopad", "roklina"] },
];

export interface TownTile {
  slug: string;
  name: string;
  kind: DestinationKind;
  carMin: number;
  walkMin: number;
  kids: boolean;
  photo: PlacePhoto | null;
  /** A yearly closure covers the trip: "1. 11. – 31. 5." (the page is built once, so the season, not today's state). */
  closedSeason: string | null;
  /** The same yearly closure as "MM-DD" start and end, for the browser to compare with today's date. */
  closedRange: { from: string; to: string } | null;
  /** Holiday block only: the latest time to leave the town, "13:40" (lib/holidayBlock.ts). */
  leaveBy?: string;
}

export function closedSeason(trip: TripSummary, lang: Lang = "sk"): string | null {
  const rule = closureRulesFor(trip).find((r) => r.kind === "rocna");
  return rule ? `${seasonDateIn(lang, rule.starts_on)}–${seasonDateIn(lang, rule.ends_on)}` : null;
}

export function closedRange(trip: TripSummary): { from: string; to: string } | null {
  const rule = closureRulesFor(trip).find((r) => r.kind === "rocna");
  return rule ? { from: monthDayOf(rule.starts_on), to: monthDayOf(rule.ends_on) } : null;
}

export interface TownRow {
  title: string;
  /** Trips of this kind within reach, more than the row shows. */
  count: number;
  tiles: TownTile[];
}

/** The Christmas-holiday block of a big town's page (lib/holidayBlock.ts). */
export interface TownHoliday {
  tiles: TownTile[];
  /** Sunset in the town on the block's day, "16:01". */
  sunset: string;
}

export interface TownTrips {
  town: Town;
  total: number;
  rows: TownRow[];
  /** Null outside the season, for the smaller towns and when too few trips fit. */
  holiday: TownHoliday | null;
}

export function getTown(id: string): Town | null {
  return getTowns().find((t) => t.id === id) ?? null;
}

/** Trips within reach of a town by car, best known first, with the drive. */
async function reachable(id: string): Promise<{ trip: TripSummary; carMin: number }[]> {
  const [trips, minutes] = await Promise.all([getAllTrips(), getTownDrives(id)]);
  const out: { trip: TripSummary; carMin: number }[] = [];
  for (const trip of trips) {
    const carMin = minutes[trip.slug];
    if (carMin != null && carMin <= TOWN_MAX_MIN) out.push({ trip, carMin });
  }
  return out.sort((a, b) => b.trip.rank - a.trip.rank);
}

/** A town page: trips in town, then rows by kind and one for kids, as photo tiles. */
export async function getTownTrips(id: string, lang: Lang = "sk"): Promise<TownTrips | null> {
  const town = getTown(id);
  if (!town) return null;
  const [reach, photos, walks] = await Promise.all([reachable(id), getPhotos(), getCarWalks()]);
  const tile = ({ trip, carMin }: { trip: TripSummary; carMin: number }): TownTile => ({
    slug: trip.slug,
    name: trip.name,
    kind: trip.destination.kind,
    carMin,
    // The trip page's walk from its default parking (approach and joins included), not the bare trail.
    walkMin: walks.get(trip.slug) ?? trip.duration_min,
    kids: trip.family_friendly,
    photo: photos[trip.destination.osm ?? `trip/${trip.slug}`] ?? null,
    closedSeason: closedSeason(trip, lang),
    closedRange: closedRange(trip),
  });
  const inTown = reach.filter((r) => haversineM(r.trip.start.location, town.location) <= IN_TOWN_M);
  const outside = reach.filter((r) => !inTown.includes(r));
  const shown = new Set<string>();
  const row = (title: string, list: typeof reach): TownRow => {
    // Photos first within the row (best known first among each), so a row never opens on a blank tile.
    const tiles = list.slice(0, PER_ROW).map(tile).sort((a, b) => Number(!a.photo) - Number(!b.photo));
    for (const t of tiles) shown.add(t.slug);
    return { title, count: list.length, tiles };
  };
  const rows = [
    row("V meste", inTown),
    ...KIND_ROWS.map(({ title, kinds }) => row(title, outside.filter((r) => kinds.includes(r.trip.destination.kind)))),
  ];
  // Kids get their own row of trips not already shown above, so the page doesn't repeat itself.
  const kids = outside.filter((r) => r.trip.family_friendly && r.carMin <= 60);
  rows.push(row("S deťmi do hodiny", kids.filter((r) => !shown.has(r.trip.slug))));
  return { town, total: reach.length, rows: rows.filter((r) => r.tiles.length > 0), holiday: holiday() };

  /** Short trips with kids for the Christmas holidays, best known first, each with its "leave by" time. */
  function holiday(): TownHoliday | null {
    if (!BIG_TOWNS.includes(town!.id) || !holidayShown(todayMonthDay())) return null;
    const year = holidayYear(wallClock(new Date()));
    const sunset = holidaySunset(year, town!.location);
    if (!sunset) return null;
    const tiles: TownTile[] = [];
    for (const r of reach) {
      const t = tile(r);
      if (!fitsHoliday({ kids: t.kids, kind: t.kind, carMin: t.carMin, walkMin: t.walkMin, maxEleM: r.trip.max_ele_m, hasClosure: r.trip.closure_rule_ids.length > 0 })) continue;
      // One tile per place: a second route to the same goal adds nothing here.
      if (tiles.some((x) => x.name === t.name)) continue;
      const leaveBy = holidayLeaveBy(year, r.trip.start.location, t.carMin, t.walkMin);
      if (!leaveBy) continue;
      tiles.push({ ...t, leaveBy });
      if (tiles.length === HOLIDAY_TILES) break;
    }
    if (tiles.length < HOLIDAY_MIN_TILES) return null;
    return { tiles: tiles.sort((a, b) => Number(!a.photo) - Number(!b.photo)), sunset };
  }
}

/** Towns with enough well-known trips close by to earn the home-page button. */
export async function getKnownTownIds(): Promise<string[]> {
  const trips = await getAllTrips();
  const known = trips.filter((t) => t.rank >= KNOWN_RANK).map((t) => t.slug);
  const ids = await Promise.all(
    getTowns().map(async (town) => {
      const minutes = await getTownDrives(town.id);
      return known.filter((slug) => (minutes[slug] ?? Infinity) <= KNOWN_MIN).length >= KNOWN_TRIPS ? town.id : null;
    }),
  );
  return ids.filter((id): id is string => id !== null);
}
