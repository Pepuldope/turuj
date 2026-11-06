import { getCloudflareContext } from "@opennextjs/cloudflare";
import { driveDestination, routeWalk, trailDetailFrom, walkFromCar } from "@/lib/data";
import { summaryFromList } from "@/lib/trips";
import { EN_TRIPS_AHEAD } from "@/lib/site";
import { LOOP_SUFFIX, loopPartner, loopTrip } from "@/lib/loopRoute";
import type { RouteBrief, TownDriveFile, TripDetail, TripIndex, TripList, TripSummary } from "@/lib/tripSchema";
import type { TrailDetail } from "@/lib/types";
import type { RouteWalk } from "@/lib/walkFacts";

// The trip files the weekly pipeline writes to public/data (docs/TRIP-DATA.md),
// read on the server. They are static assets, not part of the code bundle, so
// the number of trips doesn't count against Cloudflare's Worker size limit.
// On Cloudflare they come from the ASSETS binding; in local dev, tests and the
// build, from the disk. Server only.

interface AssetsBinding {
  fetch(req: Request): Promise<Response>;
}

// While `next build` prebuilds pages there is no Worker: asking for its bindings
// starts a local stand-in (workerd) per call, and with the town pages built ahead
// those collided on its SQLite files (SQLITE_BUSY, the 21 Oct branch builds).
const building = process.env.NEXT_PHASE === "phase-production-build";

async function readPublicJson<T>(path: string): Promise<T | null> {
  try {
    if (building) throw new Error("build");
    const { env } = await getCloudflareContext({ async: true });
    const assets = (env as unknown as Record<string, unknown>).ASSETS as AssetsBinding | undefined;
    if (assets) {
      const res = await assets.fetch(new Request(`https://assets.local/${path}`));
      if (res.ok) return (await res.json()) as T;
    }
  } catch {
    // Not on Cloudflare: read the disk below.
  }
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return JSON.parse(await readFile(join(process.cwd(), "public", path), "utf8")) as T;
  } catch {
    return null;
  }
}

const SLUG = /^[a-z0-9-]{1,120}$/;
const EMPTY_INDEX: TripIndex = { version: 1, generated_at: "", osm_data_at: null, attribution: "", trips: [] };

let index: Promise<TripIndex> | null = null;

/** Every trip as a summary. Read once per server instance. */
export function getTripIndex(): Promise<TripIndex> {
  index ??= readPublicJson<TripIndex>("data/trips/index.json").then((i) => {
    if (!i) index = null; // try again next time
    return i ?? EMPTY_INDEX;
  });
  return index;
}

let list: Promise<TripList | null> | null = null;

/** The home list (main routes only), read once per server instance. */
function getList(): Promise<TripList | null> {
  list ??= readPublicJson<TripList>("data/trips/list.json").then((l) => {
    if (!l) list = null; // try again next time
    return l;
  });
  return list;
}

let targets: Promise<{ slugs: string[]; points: [number, number][] }> | null = null;

/** Where each home-list trip's drive ends (its parking, else its start), as the home list measures to it. */
export function getDriveTargets(): Promise<{ slugs: string[]; points: [number, number][] }> {
  targets ??= getList().then((l) => {
    if (!l) targets = null;
    const slugs: string[] = [];
    const points: [number, number][] = [];
    for (const t of l?.trips ?? []) {
      const at = driveDestination(trailDetailFrom(summaryFromList(t)));
      if (!at) continue;
      slugs.push(t.slug);
      points.push([at.lat, at.lon]);
    }
    return { slugs, points };
  });
  return targets;
}

let walks: Promise<Map<string, number>> | null = null;

/**
 * Each trip's walk by car as the trip page counts it (lib/walkFacts.ts, kids pace aside). Built from
 * list.json, which carries where the parking joins the trail; index.json doesn't, and its bare
 * trail times differed from the trip pages (Velká Javorina 1 h 45 vs 35 min).
 */
export function getCarWalks(): Promise<Map<string, number>> {
  walks ??= getList().then((l) => {
    if (!l) walks = null;
    return new Map((l?.trips ?? []).map((t) => [t.slug, walkFromCar(summaryFromList(t))]));
  });
  return walks;
}

export async function getAllTrips(): Promise<TripSummary[]> {
  return (await getTripIndex()).trips;
}

/** Every trip in the shape the pages use, best known first. */
export async function getAllTrails(): Promise<TrailDetail[]> {
  return [...(await getAllTrips())].sort((a, b) => b.rank - a.rank).map(trailDetailFrom);
}

let englishAhead: Promise<Set<string>> | null = null;

/**
 * The trips whose English page is built ahead (the EN_TRIPS_AHEAD best known). Only these are
 * offered to search engines in English: the others would be drawn on each crawler's first visit,
 * which spent the free plan's CPU and page-cache writes (Ahrefs crawl, 2 Nov: 283 server errors).
 */
export function englishTripsAhead(): Promise<Set<string>> {
  englishAhead ??= getAllTrails().then((trails) => new Set(trails.slice(0, EN_TRIPS_AHEAD).map(({ trail }) => trail.slug)));
  return englishAhead;
}

/** Full trip with path, alternatives and POIs, or null for an unknown slug. */
export async function getTrip(slug: string): Promise<TripDetail | null> {
  if (!SLUG.test(slug)) return null;
  return readPublicJson<TripDetail>(`data/trips/${slug}.json`);
}

/**
 * Every trip's slug, main routes and other routes alike, from the files on disk.
 * Build only: the trip pages are drawn ahead from this list (app/trasa/[slug]/page.tsx).
 */
export async function getAllTripSlugs(): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const files = await readdir(join(process.cwd(), "public", "data", "trips"));
  return files
    .filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "list.json")
    .map((f) => f.slice(0, -".json".length))
    .filter((slug) => SLUG.test(slug))
    .sort();
}

/** A free-licence photo of a trip's destination from Wikimedia Commons or Mapillary (pipeline/photos.py). */
export interface PlacePhoto {
  url: string;
  w: number;
  h: number;
  author: string;
  license: string;
  /** Link to the licence text, from Commons (older files: none, the page links known CC licences itself). */
  license_url?: string | null;
  page: string;
  /** Where it was found; "mapillary" = a street-level photo kept in public/photos/m/. */
  via?: string;
}

/** Width of the share image (og:image), one of Wikimedia's standard thumbnail steps (F15). */
const SHARE_W = 1280;

/**
 * The photo for og:image: a Commons thumbnail is re-addressed to the 1280 px step (the stored one is
 * 500 px, too small for share previews). The original's width is not in photos.json (only the 500 px
 * thumb's), so no cap is possible: Commons serves JPEG/PNG requests wider than the file by scaling up
 * (checked: a 402 px original answers 200 at 1280px), and a 1280 px card is what share previews want.
 * Mapillary, self-hosted, and un-thumbnailed Commons URLs are returned as they are. The page's own
 * <img> keeps the 500 px file.
 */
export function shareImage(p: PlacePhoto): { url: string; width: number; height: number } {
  const m = /^(https:\/\/(?:thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/)\d+px-([^/]+)$/.exec(p.url);
  if (p.via === "mapillary" || !m || p.w <= 0 || p.w >= SHARE_W) return { url: p.url, width: p.w, height: p.h };
  return { url: `${m[1]}${SHARE_W}px-${m[2]}`, width: SHARE_W, height: Math.round((p.h * SHARE_W) / p.w) };
}

/** The photo's archive, for the credit line. */
export function photoSource(p: PlacePhoto): string {
  return p.via === "mapillary" ? "Mapillary" : "Wikimedia Commons";
}

let photos: Promise<Record<string, PlacePhoto>> | null = null;

/** Destination photos by OSM id ("node/123"), or "trip/<slug>" for hand-made trips; empty when the file is missing. */
export function getPhotos(): Promise<Record<string, PlacePhoto>> {
  photos ??= readPublicJson<{ photos: Record<string, PlacePhoto> }>("data/photos.json").then((f) => f?.photos ?? {});
  return photos;
}

let photoKeys: Promise<Record<string, string>> | null = null;

/** The photo of a trip's place, by slug (via public/data/photo-keys.json, made before each build); null when none. */
export async function getTripPhoto(slug: string, osm?: string | null): Promise<PlacePhoto | null> {
  photoKeys ??= readPublicJson<Record<string, string>>("data/photo-keys.json").then((f) => f ?? {});
  const all = await getPhotos();
  return all[osm ?? (await photoKeys)[slug] ?? `trip/${slug}`] ?? null;
}

/** Car minutes from one precomputed town to every trip, by slug; empty for an unknown town. */
export async function getTownDrives(townId: string): Promise<TownDriveFile["minutes"]> {
  if (!SLUG.test(townId)) return {};
  return (await readPublicJson<TownDriveFile>(`data/drive/${townId}.json`))?.minutes ?? {};
}

/** The walk from the default parking and stop for each route of a place, as each route's own page counts it. */
export async function getRouteWalks(slugs: string[]): Promise<Record<string, RouteWalk>> {
  const out: Record<string, RouteWalk> = {};
  await Promise.all(
    slugs.map(async (slug) => {
      const trip = slug.endsWith(LOOP_SUFFIX) ? (await getLoop(slug.slice(0, -LOOP_SUFFIX.length)))?.trip : await getTrip(slug);
      if (trip) out[slug] = routeWalk(trailDetailFrom(trip));
    })
  );
  return out;
}

/** The routes to a trip's place, from its own file or its main route's. */
export async function getPlaceRoutes(trip: TripDetail): Promise<RouteBrief[]> {
  return trip.routes ?? (trip.variant_of ? ((await getTrip(trip.variant_of))?.routes ?? []) : []);
}

/** A route walked as a loop, up it and back down another from the same start (lib/loopRoute.ts); null when it has none. */
export async function getLoop(slug: string): Promise<{ trip: TripDetail; back: RouteBrief } | null> {
  const own = await getTrip(slug);
  if (!own || own.route === "okruh") return null;
  const routes = await getPlaceRoutes(own);
  const back = loopPartner(slug, routes);
  const other = back ? await getTrip(back.slug) : null;
  if (!back || !other) return null;
  return { trip: { ...loopTrip(own, other), routes }, back };
}

/**
 * The place's routes, then each loop as a route of its own ("<slug>/okruh"): up one route, back
 * down another from the same start, listed and compared with the rest (Peter, 2026-10-24: loops
 * are new routes from the same spot, not a different way down tucked under the list).
 */
export async function withLoopRoutes(routes: RouteBrief[]): Promise<RouteBrief[]> {
  const pairs = new Set<string>();
  const loops: RouteBrief[] = [];
  for (const r of routes) {
    const back = loopPartner(r.slug, routes);
    if (!back) continue;
    const pair = [r.slug, back.slug].sort().join("|");
    if (pairs.has(pair)) continue;
    pairs.add(pair);
    const loop = await getLoop(r.slug);
    if (!loop) continue;
    const t = loop.trip;
    loops.push({
      slug: `${r.slug}${LOOP_SUFFIX}`,
      route_label: loops.length ? `Okruh ${loops.length + 1}` : "Okruh",
      variant_of: r.variant_of ?? r.slug,
      start_name: r.start_name,
      parking: r.parking,
      transit: r.transit,
      duration_min: t.duration_min,
      distance_m: t.distance_m,
      ascent_m: t.ascent_m,
      up: t.path.map(([lon, lat]) => [lon, lat] as [number, number]),
    });
  }
  return [...routes, ...loops];
}
