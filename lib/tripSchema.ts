// Trip data schema, version 1. The weekly pipeline (pipeline/) writes these
// files; the site only reads them. Full description: docs/TRIP-DATA.md.
//
//   public/data/trips/index.json   TripIndex       main route of every place (server: home, sitemap, API)
//   data/trip-variants.json        TripIndex-like  the other routes of each place (database load only)
//   public/data/trips/list.json    TripList        every trip, trimmed for the home list
//   public/data/trips/<slug>.json  TripDetail      one trip with its path, parking, stops, POIs
//   public/data/drive/<town>.json  TownDriveFile   car times from one town to every trip
//   data/towns.json                Towns           the towns of the drive table
//   data/closure-rules.json        ClosureRules    hand-kept, every rule has an official source
//   data/fee-rules.json            FeeRules        hand-kept entry fees (vstupné) with sources
//   public/gpx/<main slug>.gpx                     full-resolution GPX, a track per route of the place
//
// Rules for consumers:
// - Never show a trip as "open" because closure_rule_ids is empty. No rule
//   means "Stav chodníka neoverený" (see README, closure rule).
// - Slugs are stable across weekly runs (pipeline/slugs.json), so they are
//   safe for URLs, saved trips and share links.
// - Every page that shows trip data must credit OpenStreetMap (attribution).

export const TRIP_SCHEMA_VERSION = 1;

export type Difficulty = "lahka" | "stredna" | "tazka";

import type { TrailJoin } from "@/lib/trailJoin";

/** KST trail marking colours (turistické značky). */
export type MarkColour = "red" | "blue" | "green" | "yellow" | "black";

export type DestinationKind =
  | "vrchol" // peak
  | "vyhliadka" // viewpoint or lookout tower
  | "hrad" // castle or ruin
  | "chata" // mountain hut
  | "pleso" // tarn or lake
  | "vodopad" // waterfall
  | "jaskyna" // show cave
  | "roklina" // gorge or canyon walked through (Jánošíkove diery, Suchá Belá)
  | "ine";

/** pipeline/config.yaml regions. */
export type RegionId =
  | "tatry"
  | "slovensky-raj"
  | "mala-fatra"
  | "male-karpaty"
  | "velka-fatra"
  | "nizke-tatry"
  | "chocske-vrchy-orava"
  | "pieniny"
  | "kysuce-javorniky"
  | "strazovske-vrchy"
  | "biele-karpaty"
  | "inovec-tribec-vtacnik"
  | "stiavnicke-kremnicke-vrchy"
  | "polana-muran"
  | "slovensky-kras"
  | "levocske-cergov"
  | "vychod"
  | "zahorie-podunajsko"
  | "krupina-cerova"
  | "kosice-juh"
  | "dalsie";

export type TransitMode = "autobus" | "elektricka" | "vlak";

export type PoiKind = "vyhliadka" | "chata" | "obcerstvenie" | "pramen" | "hrad" | "ihrisko" | "utulna";
/** What kind of food place an "obcerstvenie" is (pipeline/osm.py food_kind). */
export type FoodKind = "restauracia" | "kaviaren" | "bufet";

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

/** OpenStreetMap object reference, e.g. "node/123456". */
export type OsmRef = string;

export interface Place {
  name: string;
  location: GeoPoint;
  ele_m: number | null;
  osm: OsmRef | null;
}

export interface Destination extends Place {
  kind: DestinationKind;
}

/** The walk on paths from a parking or stop to where the site joins the trail (pipeline/walks.py). */
export interface WalkLine {
  /** [lon, lat] */
  line: [number, number][];
  m: number;
  min: number;
}

export interface Parking {
  name: string | null;
  location: GeoPoint;
  /** Walking distance from the parking to the trip start, metres (straight line). */
  walk_m: number;
  /** true = paid (OSM fee=yes), false = free (fee=no), null = unknown. */
  fee: boolean | null;
  osm: OsmRef | null;
  /** Only in the trip's own file; absent when routing found none or the trail is right there. */
  walk?: WalkLine;
  /** Only in list.json (scripts/list-joins.ts): where the trip page joins the trail, which the home list can't work out without the path. */
  join?: ListJoin;
}

export interface TransitStop {
  name: string;
  mode: TransitMode;
  location: GeoPoint;
  /** Straight-line distance to the trip start, metres. */
  walk_m: number;
  osm: OsmRef | null;
  /** As on Parking. */
  walk?: WalkLine;
  /** As on Parking. */
  join?: ListJoin;
}

/** lib/trailJoin.ts TrailJoin as list.json stores it. */
export type ListJoin = Omit<TrailJoin, "walk_cut">;

export interface Fee {
  /** "vstupne" = entry to the area or sight; "parkovne" = parking charge known from a rule. */
  kind: "vstupne" | "parkovne";
  /** Short Slovak text for the UI, e.g. "Vstupné do hradu 8 €". */
  text: string;
  amount_eur: number | null;
  /** Where the information comes from: an OSM tag or a fee rule with an official source. */
  source: "osm" | "rule";
  source_url: string | null;
  /** Fee rule id when source = "rule". */
  rule_id: string | null;
}

/** One trip = walk from a trailhead to a destination and back the same way. */
export interface TripSummary {
  slug: string;
  /** Display name. Generated trips: the destination name ("Kriváň"); curated ones carry a full name. */
  name: string;
  /** Short Slovak description, generated from the facts unless curated. */
  description: string;
  region: RegionId;
  region_name: string;
  /** National park or protected area name when the destination is inside one, e.g. "TANAP". */
  protected_area: string | null;
  destination: Destination;
  /** Where the walk starts: a KST guidepost or a village centre. */
  start: Place;
  /** Best parking for the start, the drive destination. null = no parking found nearby. */
  parking: Parking | null;
  /** Nearest public-transport stop to the start (bus/tram within 1 km, train within 2 km). */
  transit: TransitStop | null;
  /** "tam-a-spat" = there and back the same way; "okruh" = loop (e.g. one-way gorges in Slovenský raj). */
  route: "tam-a-spat" | "okruh";
  /** Whole walk, back at the start. */
  distance_m: number;
  ascent_m: number;
  /** DIN 33466 walking time for the round trip, rounded up to 15 min, no breaks. */
  duration_min: number;
  max_ele_m: number | null;
  difficulty: Difficulty;
  family_friendly: boolean;
  /** KST marking colours walked, most-used first. */
  marking: MarkColour[];
  /** Share of the walk on marked trails, 0..1. */
  marked_share: number;
  /** Entry fees (vstupné) known from OSM or fee rules. Empty = none known, not "free". */
  fees: Fee[];
  /** Ids into data/closure-rules.json. Empty = no known rule, which means "unverified", never "open". */
  closure_rule_ids: string[];
  /** 0..100, higher = better known destination. Default sort tie-breaker. */
  rank: number;
  bbox: BBox;
  /** true = one of the hand-picked trips (also the regression test set). */
  curated: boolean;
  gpx_url: string;
  /**
   * Most places have several marked routes. The main one (no variant_of) is on the home
   * list and map; the others carry the main trip's slug and show only on its trip page.
   */
  variant_of?: string;
  /** Why someone would pick this route: "Hlavná cesta", "Kratšia", "Cez Likavský hrad"… Absent when the place has one route. */
  route_label?: string;
  /** Main trips: how many routes lead to the place, this one included. */
  route_count?: number;
  /**
   * Home list only: a clearly shorter route to the same place, by car and by bus, as its own trip
   * page counts the walk (scripts/list-joins.ts, shorterRoute in lib/walkFacts.ts). A 4 h card
   * scared people off places with a 1 h way up (Peter, 2026-10-23).
   */
  shorter?: { car?: ShorterRoute; bus?: ShorterRoute };
  /** Home list only: the easiest other route when it is easier than this one, so a difficulty filter finds the place (A13, Peter 2026-10-26). */
  easier?: { slug: string; difficulty: Difficulty };
}

/** Another route to the same place and its walk in minutes (from its parking or stop, there and back). */
export interface ShorterRoute {
  slug: string;
  min: number;
}

export interface MarkingRun {
  /** Index into TripDetail.path where this run starts (inclusive). */
  from: number;
  /** Index into TripDetail.path where this run ends (inclusive). */
  to: number;
  /** null = unmarked path or road. */
  colour: MarkColour | null;
}

export interface Poi {
  kind: PoiKind;
  name: string;
  location: GeoPoint;
  osm: OsmRef | null;
  /** Off the walk: minutes there and back (at most ~30). Absent for places on the walk. */
  detour_min?: number;
  /** Food places: a restaurant, a café or bar, or a buffet. Absent on trips built before 2026-10-24. */
  food?: FoodKind;
}

export interface TripDetail extends TripSummary {
  /**
   * [lon, lat, ele_m | null], simplified to ~10 m. For "tam-a-spat" the way up
   * only (start -> destination; the way back is the same). For "okruh" the
   * whole loop, start -> destination -> start; turnaround_index marks the destination.
   */
  path: [number, number, number | null][];
  turnaround_index: number;
  /** Colour of the trail marking along `path`, for drawing the route in KST colours. */
  marking_runs: MarkingRun[];
  /** Other parking places near the start, nearest first (excludes `parking`). */
  parking_alternatives: Parking[];
  /** Other stops near the start, nearest first (excludes `transit`). */
  transit_alternatives: TransitStop[];
  /** Huts, springs, viewpoints, castles within ~150 m of the path, then side trips (detour_min). */
  pois: Poi[];
  /** Every route to this place, main first, when there is more than one (absent otherwise). */
  routes?: RouteBrief[];
}

/** One route to a place, as the trip page lists it next to the others. */
export interface RouteBrief {
  slug: string;
  route_label: string | null;
  /** Absent on the main route. */
  variant_of?: string;
  start_name: string;
  parking: boolean;
  transit: boolean;
  duration_min: number;
  distance_m: number;
  ascent_m: number;
  /** The way up as [lon, lat] (the whole loop for "okruh"). */
  up: [number, number][];
}

export interface TripIndex {
  version: number;
  /** When the pipeline ran (ISO timestamp). */
  generated_at: string;
  /** Timestamp of the OpenStreetMap data used (ISO timestamp). */
  osm_data_at: string | null;
  attribution: string;
  trips: TripSummary[];
}

export interface ClosureRule {
  id: string;
  /** Short Slovak reason shown in the UI. */
  reason: string;
  /** "rocna" = every year, compared by month/day; "jednorazova" = real dates. */
  kind: "rocna" | "jednorazova";
  /** YYYY-MM-DD. For "rocna" only month/day matter. */
  starts_on: string;
  ends_on: string;
  source_url: string;
  /** When a person last checked the source (YYYY-MM-DD). */
  verified_on: string;
  /** Plain-language note on which trips the rule covers. */
  applies_to: string;
  /** An extra line under the closure on these trips (slug -> Slovak text), e.g. the lift around a closed path. */
  trip_notes?: Record<string, string>;
  /** Read only by the pipeline. */
  selector?: unknown;
}

export interface ClosureRules {
  version: number;
  rules: ClosureRule[];
}

export interface FeeRule {
  id: string;
  text: string;
  amount_eur: number | null;
  source_url: string;
  verified_on: string;
  applies_to: string;
  /** Read only by the pipeline. */
  selector?: unknown;
}

export interface FeeRules {
  version: number;
  rules: FeeRule[];
}

export interface Town {
  /** Slug of the town name, e.g. "banska-bystrica". */
  id: string;
  name: string;
  location: GeoPoint;
}

export interface Towns {
  version: number;
  generated_at: string;
  /** e.g. "OSRM, car profile, OpenStreetMap data". */
  source: string;
  towns: Town[];
}

/** Car times from one town to every trip. Drive ends at the trip's parking (or start). */
export interface TownDriveFile {
  version: number;
  generated_at: string;
  town: string;
  /** Minutes by trip slug, null = no route found. */
  minutes: Record<string, number | null>;
  km: Record<string, number | null>;
}

/** The fields of a TripSummary the home list leaves out (public/data/trips/list.json). */
export type ListDropped = "description" | "gpx_url" | "marked_share" | "curated" | "protected_area" | "max_ele_m";

export interface TripList {
  version: number;
  generated_at: string;
  trips: Omit<TripSummary, ListDropped>[];
}
