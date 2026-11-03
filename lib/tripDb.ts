// Trips from the D1 database (tables from pipeline/db.py, loaded weekly by
// .github/workflows/db.yml). Every function falls back to the static files in
// public/data (lib/tripFiles.ts) when the database is missing (local dev, Vercel) or not loaded yet, so
// the site works the same either way. Server only.
import { isClosureActive } from "@/lib/closures";
import { getDb } from "@/lib/d1";
import type { D1Like } from "@/lib/d1";
import { getAllTrips, getTownDrives, getTrip, getTripIndex } from "@/lib/tripFiles";
import { closureRulesFor } from "@/lib/trips";
import type { Fee, Parking, Poi, TransitStop, TripDetail, TripSummary } from "@/lib/tripSchema";

export type DataSource = "databaza" | "subory";

interface TripRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  region: string;
  region_name: string;
  protected_area: string | null;
  route_type: TripSummary["route"];
  distance_m: number;
  ascent_m: number;
  duration_min: number;
  max_ele_m: number | null;
  difficulty: TripSummary["difficulty"];
  family_friendly: number;
  marked_share: number;
  rank: number;
  curated: number;
  gpx_url: string;
  marking_json: string;
  bbox_json: string;
  path_json: string | null;
  turnaround_index: number | null;
  marking_runs_json: string | null;
  variant_of: string | null;
  route_label: string | null;
  route_count: number | null;
  d_name: string;
  d_kind: TripSummary["destination"]["kind"];
  d_lat: number;
  d_lon: number;
  d_ele: number | null;
  d_osm: string | null;
  s_name: string;
  s_lat: number;
  s_lon: number;
  s_ele: number | null;
  s_osm: string | null;
}

const TRIP_SELECT = `
  SELECT t.*, r.slug AS region, r.name AS region_name, pa.name AS protected_area,
         d.name AS d_name, d.kind AS d_kind, d.lat AS d_lat, d.lon AS d_lon, d.ele_m AS d_ele, d.osm_ref AS d_osm,
         s.name AS s_name, s.lat AS s_lat, s.lon AS s_lon, s.ele_m AS s_ele, s.osm_ref AS s_osm
  FROM trip t
  JOIN region r ON r.id = t.region_id
  LEFT JOIN protected_area pa ON pa.id = t.protected_area_id
  JOIN place d ON d.id = t.destination_id
  JOIN place s ON s.id = t.start_id`;

/** The loaded weekly build, or null when the trip tables are missing or half-loaded. */
async function loadedVersion(db: D1Like): Promise<string | null> {
  try {
    const row = await db.prepare("SELECT generated_at FROM data_version WHERE id = 1").first<{ generated_at: string }>();
    return row?.generated_at ?? null;
  } catch {
    return null;
  }
}

/** The database when it holds a complete trip build. */
export async function tripDb(): Promise<D1Like | null> {
  const db = await getDb();
  return db && (await loadedVersion(db)) ? db : null;
}

/** One trip with its walk, parking, stops and places, as in public/data/trips/<slug>.json. */
export async function tripFromDb(db: D1Like, slug: string): Promise<TripDetail | null> {
  const t = await db.prepare(`${TRIP_SELECT} WHERE t.slug = ?1`).bind(slug).first<TripRow>();
  if (!t) return null;
  const [parking, stops, pois, closures, fees] = await Promise.all([
    db
      .prepare("SELECT name, lat, lon, walk_m, fee_paid, is_primary, osm_ref, walk_json FROM parking WHERE trip_id = ?1 ORDER BY is_primary DESC, id")
      .bind(t.id)
      .all<{ name: string | null; lat: number; lon: number; walk_m: number; fee_paid: number | null; is_primary: number; osm_ref: string | null; walk_json: string | null }>(),
    db
      .prepare(
        `SELECT s.name, s.mode, s.lat, s.lon, s.osm_ref, ts.walk_m, ts.is_primary, ts.walk_json FROM trip_transit_stop ts
         JOIN transit_stop s ON s.id = ts.stop_id WHERE ts.trip_id = ?1 ORDER BY ts.position`
      )
      .bind(t.id)
      .all<{ name: string; mode: TransitStop["mode"]; lat: number; lon: number; osm_ref: string | null; walk_m: number; is_primary: number; walk_json: string | null }>(),
    db
      // "*": detour_min and food arrive with the next full load; until then the columns are simply absent.
      .prepare("SELECT * FROM poi WHERE trip_id = ?1 ORDER BY position")
      .bind(t.id)
      .all<{ kind: Poi["kind"]; name: string; lat: number; lon: number; osm_ref: string | null; detour_min?: number | null; food?: Poi["food"] | null }>(),
    db.prepare("SELECT rule_id FROM trip_closure WHERE trip_id = ?1 ORDER BY rule_id").bind(t.id).all<{ rule_id: string }>(),
    db
      .prepare(
        `SELECT f.kind, f.text, f.amount_eur, f.source, f.source_url, f.rule_id FROM trip_fee tf
         JOIN fee f ON f.id = tf.fee_id WHERE tf.trip_id = ?1 ORDER BY f.id`
      )
      .bind(t.id)
      .all<Fee>(),
  ]);

  const toParking = (p: (typeof parking.results)[number]): Parking => ({
    name: p.name,
    location: { lat: p.lat, lon: p.lon },
    walk_m: p.walk_m,
    fee: p.fee_paid === null ? null : p.fee_paid === 1,
    osm: p.osm_ref,
    ...(p.walk_json ? { walk: JSON.parse(p.walk_json) } : {}),
  });
  const toStop = (s: (typeof stops.results)[number]): TransitStop => ({
    name: s.name,
    mode: s.mode,
    location: { lat: s.lat, lon: s.lon },
    walk_m: s.walk_m,
    osm: s.osm_ref,
    ...(s.walk_json ? { walk: JSON.parse(s.walk_json) } : {}),
  });
  const primaryParking = parking.results.find((p) => p.is_primary === 1);
  const primaryStop = stops.results.find((s) => s.is_primary === 1);

  return {
    slug: t.slug,
    name: t.name,
    description: t.description,
    region: t.region as TripSummary["region"],
    region_name: t.region_name,
    protected_area: t.protected_area,
    destination: {
      name: t.d_name,
      kind: t.d_kind,
      location: { lat: t.d_lat, lon: t.d_lon },
      ele_m: t.d_ele,
      osm: t.d_osm,
    },
    start: { name: t.s_name, location: { lat: t.s_lat, lon: t.s_lon }, ele_m: t.s_ele, osm: t.s_osm },
    parking: primaryParking ? toParking(primaryParking) : null,
    transit: primaryStop ? toStop(primaryStop) : null,
    route: t.route_type,
    distance_m: t.distance_m,
    ascent_m: t.ascent_m,
    duration_min: t.duration_min,
    max_ele_m: t.max_ele_m,
    difficulty: t.difficulty,
    family_friendly: t.family_friendly === 1,
    marking: JSON.parse(t.marking_json),
    marked_share: t.marked_share,
    fees: fees.results,
    closure_rule_ids: closures.results.map((c) => c.rule_id),
    rank: t.rank,
    bbox: JSON.parse(t.bbox_json),
    curated: t.curated === 1,
    gpx_url: t.gpx_url,
    // Only set when a place has more than one route, as in the files.
    ...(t.variant_of != null ? { variant_of: t.variant_of } : {}),
    ...(t.route_label != null ? { route_label: t.route_label } : {}),
    ...(t.route_count != null ? { route_count: t.route_count } : {}),
    path: t.path_json ? JSON.parse(t.path_json) : [],
    turnaround_index: t.turnaround_index ?? 0,
    marking_runs: t.marking_runs_json ? JSON.parse(t.marking_runs_json) : [],
    parking_alternatives: parking.results.filter((p) => p.is_primary !== 1).map(toParking),
    transit_alternatives: stops.results.filter((s) => s.is_primary !== 1).map(toStop),
    pois: pois.results.map((p) => ({
      kind: p.kind,
      name: p.name,
      location: { lat: p.lat, lon: p.lon },
      osm: p.osm_ref,
      ...(p.detour_min ? { detour_min: p.detour_min } : {}),
      ...(p.food ? { food: p.food } : {}),
    })),
  };
}

/** A trip for the trip page: from the database, else from the static files. */
export async function getTripLive(slug: string): Promise<{ trip: TripDetail | null; source: DataSource }> {
  const db = await tripDb();
  if (db) {
    try {
      const trip = await tripFromDb(db, slug);
      // Not in the database: maybe a trip newer than its last load, so ask the files.
      if (trip) return { trip, source: "databaza" };
    } catch {
      // Fall through to the files: a database hiccup must not take the page down.
    }
  }
  return { trip: await getTrip(slug), source: "subory" };
}

/**
 * Car minutes from one precomputed town to every trip, by slug. From the deployed files, not the
 * database: lining the database's array up with the trips read all 6,468 trip rows each time
 * (D1 free plan: 5 million rows a day, used up on 29 Oct and 2 Nov).
 */
export async function townDriveMinutes(townSlug: string): Promise<{ minutes: Record<string, number | null>; source: DataSource }> {
  return { minutes: await getTownDrives(townSlug), source: "subory" };
}

export interface TripListItem {
  slug: string;
  name: string;
  region: string;
  region_name: string;
  destination: { name: string; kind: string; lat: number; lon: number; ele_m: number | null };
  difficulty: string;
  family_friendly: boolean;
  distance_m: number;
  ascent_m: number;
  duration_min: number;
  rank: number;
  /** Car minutes one way from the town, when a town was given. */
  drive_min: number | null;
  /** Drive there and back plus the walk, when a town was given. */
  total_min: number | null;
  /** A closure rule covers this trip on the given day. */
  closed: boolean;
  url: string;
}

export interface TripListQuery {
  /** Town id from data/towns.json, e.g. "bratislava". */
  town: string | null;
  /** YYYY-MM-DD for the closure check. */
  date: string;
  limit: number;
}

/** Closure rule ids active on `date` (month/day for yearly rules), for a list of rules. */
function activeRuleIds(rules: { id: string; kind: "rocna" | "jednorazova"; starts_on: string; ends_on: string }[], date: string): Set<string> {
  return new Set(
    rules
      .filter((r) => isClosureActive({ id: r.id, trail_id: "", kind: r.kind, starts_on: r.starts_on, ends_on: r.ends_on, reason: "", source_url: "", verified_on: "" }, date))
      .map((r) => r.id)
  );
}

/** Nearest first (or best known without a town); ties by rank, then name, so both sources agree. */
function sortList(items: TripListItem[]): TripListItem[] {
  const byTime = (a: TripListItem, b: TripListItem) =>
    a.total_min !== null && b.total_min !== null ? a.total_min - b.total_min : a.total_min !== null ? -1 : b.total_min !== null ? 1 : 0;
  return items.sort((a, b) => byTime(a, b) || b.rank - a.rank || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** Trips for GET /api/vylety: nearest first from a town, or best known first. One per place (its main route). */
export async function listTrips(q: TripListQuery): Promise<{ trips: TripListItem[]; source: DataSource; generated_at: string }> {
  // From the deployed files: the same data as the database (lib/tripDb.test.ts), without reading
  // about 10,900 database rows per answer (D1 free plan: 5 million a day).
  const { minutes } = await townDriveMinutes(q.town ?? "");
  const trips = (await getAllTrips()).filter((t) => !t.variant_of).map((t) => {
    const drive = q.town ? (minutes[t.slug] ?? null) : null;
    const active = activeRuleIds(closureRulesFor(t), q.date);
    return {
      slug: t.slug,
      name: t.name,
      region: t.region,
      region_name: t.region_name,
      destination: {
        name: t.destination.name,
        kind: t.destination.kind,
        lat: t.destination.location.lat,
        lon: t.destination.location.lon,
        ele_m: t.destination.ele_m,
      },
      difficulty: t.difficulty,
      family_friendly: t.family_friendly,
      distance_m: t.distance_m,
      ascent_m: t.ascent_m,
      duration_min: t.duration_min,
      rank: t.rank,
      drive_min: drive,
      total_min: drive === null ? null : 2 * drive + t.duration_min,
      closed: t.closure_rule_ids.some((id) => active.has(id)),
      url: `/trasa/${t.slug}`,
    };
  });
  return { trips: sortList(trips).slice(0, q.limit), source: "subory", generated_at: (await getTripIndex()).generated_at };
}
