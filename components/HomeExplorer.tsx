"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Difficulty, LatLng, TrailDetail } from "@/lib/types";
import { driveDestination, nearestStop, primaryTrailhead, routeWalk, sunLocation, trailDetailFrom } from "@/lib/data";
import { formatKm, pickWalk, walkMinutes } from "@/lib/walkFacts";
import { activeClosures } from "@/lib/closures";
import { hikeMinutes } from "@/lib/dayPlan";
import { addDaysIso, dayFit, dayInSentence, isoDate } from "@/lib/days";
import { TOWN_EXACT_KM, quickDriveMin, transitMinutes } from "@/lib/drive";
import { DIFFICULTY_LABEL, GOAL_LABEL, GOAL_PLURAL, formatDurationShort } from "@/lib/format";
import { kindSvg } from "@/lib/kindIcons";
import { GOAL_COLOUR, POPULARITY_RAMP } from "@/lib/palette";
import { LAND, seasonOf } from "@/lib/season";
import type { DestinationKind } from "@/lib/tripSchema";
import { unpackList } from "@/lib/packedList";
import type { PackedList } from "@/lib/packedList";
import { getTowns, summaryFromList } from "@/lib/trips";
import { haversineM } from "@/lib/geo";
import { plain, preparePlaces, searchPlaces } from "@/lib/placeSearch";
import type { PlaceSearch, SearchIndexFile } from "@/lib/placeSearch";
import { useTripSettings } from "@/lib/tripSettings";
import { knownDriveMin, useStartDrives, useTownDrives } from "@/lib/useDriveRoute";
import { clearAllStops } from "@/lib/tripStops";
import { useUserLocation } from "@/lib/userLocation";
import { FilterChips, KidsRow } from "@/components/FilterChips";
import { MapExpandButton } from "@/components/MapExpandButton";
import { SeasonScene } from "@/components/SeasonScene";
import { PullSky, SunPull } from "@/components/SunPull";
import { UiIcon } from "@/components/UiIcon";
import { AppBar } from "@/components/AppBar";
import { SiteFooter } from "@/components/SiteFooter";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { track, trackListEmpty } from "@/lib/analytics";
import { townFrom } from "@/lib/townNames";
import { suggestTowns } from "@/lib/townSuggest";
import { decimal } from "@/lib/lang";
import { StartChip } from "@/components/StartChip";
import { TownButton } from "@/components/TownButton";
import { TripCard } from "@/components/TripCard";
import type { TripCardItem } from "@/components/TripCard";
import { BrowseMap } from "@/components/BrowseMap";
import type { BrowseArea, BrowseTrip, MapFocus, MapView } from "@/components/BrowseMap";
import "@/lib/legacyStorage";
import { dockMoved, pop, useDockFlip, useStuckPop } from "@/lib/dockFlip";

/**
 * The home headline, one at random per visit. A tiny script right after the
 * <h1> (PICK_HEADLINE) picks it while the page is still loading, so the first
 * paint already shows it: changing it after the scripts start made the
 * headline repaint seconds later, which phones scored as a slow page (LCP).
 */
const HEADLINES = ["Kam na výlet?", "Kam vyrazíme?", "Kam do hôr?", "Kam ťa to ťahá?", "Vyrazme von!", "Hory čakajú."];
const PICK_HEADLINE =
  "(function(){var h=document.currentScript.previousElementSibling,l=JSON.parse(h.dataset.hl),i=Math.floor(Math.random()*l.length);window.__turujHl=i;h.textContent=l[i]})()";
declare global {
  interface Window {
    __turujHl?: number;
  }
}
let headline: string | null = null;
const pickHeadline = () => (headline ??= HEADLINES[window.__turujHl ?? Math.floor(Math.random() * HEADLINES.length)]);
const noChange = () => () => {};
function useHeadline(): string {
  // While hydrating, the server snapshot runs in the browser too: the script's pick, so nothing changes.
  return useSyncExternalStore(noChange, pickHeadline, () => (typeof window === "undefined" ? HEADLINES[0] : pickHeadline()));
}

interface Props {
  /** The best known trips, rendered with the page; every trip loads after it. */
  trails: TrailDetail[];
  /** Towns that get the "Výlety okolo …" button (lib/townTrips.ts). */
  knownTowns: string[];
}

/** Cards shown at first, and added by each "Ukázať ďalšie". */
const PAGE = 30;

const DESKTOP_QUERY = "(min-width: 1024px)";

/** Goal filters, most common first. */
const GOAL_FILTERS: DestinationKind[] = ["vrchol", "vodopad", "pleso", "hrad", "jaskyna", "roklina", "vyhliadka", "chata"];

/** Time on the trail (walking minutes at the group's pace), in buckets (Peter, 2026-10-22). */
const TIME_FILTERS: { key: string; label: string; min: number; max: number }[] = [
  { key: "2", label: "do 2 h", min: 0, max: 120 },
  { key: "4", label: "2 – 4 h", min: 121, max: 240 },
  { key: "6", label: "4 – 6 h", min: 241, max: 360 },
  { key: "x", label: "nad 6 h", min: 361, max: Infinity },
];

/** How far from the start, in minutes of travel there (Peter, 2026-10-22: "miesta okolo"). */
const FAR_FILTERS = [30, 60, 90, 120] as const;
const DIFFICULTIES: Difficulty[] = ["lahka", "stredna", "tazka"];

/**
 * Zoomed in, the list shows the trips nearest the map's centre, the better known ones a little
 * ahead: each point of popularity (rank 0-100) counts as this many km closer. 0.1 = the best
 * known trip competes with one 10 km nearer. Raise it to favour popular trips, lower it for distance.
 */
const KM_PER_RANK = 0.1;
/** The header sun sits between the logo and the buttons: at 0.64 the EN/SK button covered it on phones (Peter, 2026-10-26). */
const HEADER_SUN_X = 0.42;
/** Zoomed far in, the list still takes trips from at least this far round the map (km, half a side). */
const LIST_MIN_HALF_KM = 11;

/** Trips outside the named mountain ranges: they join the closest area. */
const OTHER_REGION = "Ďalšie";

/** Phones: room kept free at the bottom of the map for the trip preview. */
const SHEET_INSET = 230;
const MAP_HINT_KEY = "turuj-map-hint";

type Box = [number, number, number, number];
type Preview =
  | { kind: "trip"; slug: string; also: string[]; x: number; y: number; peek: boolean }
  | { kind: "trail"; nearby: { slug: string; km: number }[]; x: number; y: number };

function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True at Tailwind `lg:` and up; false on the server. Used to mount exactly one map. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
}

/**
 * The whole list is fetched and built once per visit, not on every return to
 * the home page; a failed fetch (offline) is tried again next time. It comes
 * packed (public/data/home-list.json, a third of list.json's 1.7 MB; see
 * scripts/pack-list.mjs), which matters most on a slow phone.
 */
let allTrailsP: Promise<TrailDetail[] | null> | null = null;
let allTrailsDone: TrailDetail[] | null = null;
function loadAllTrails(): Promise<TrailDetail[] | null> {
  allTrailsP ??= fetch("/data/home-list.json")
    .then((r) => (r.ok ? (r.json() as Promise<PackedList>) : null))
    .then((packed) => {
      if (!packed) return null;
      const list = unpackList(packed);
      const trips = list.trips.map(summaryFromList).sort((a, b) => b.rank - a.rank);
      return (allTrailsDone = trips.map(trailDetailFrom));
    })
    .catch(() => null)
    .then((trips) => {
      if (!trips) allTrailsP = null;
      return trips;
    });
  return allTrailsP;
}

/** Every trip from public/data/trips/list.json (via its packed copy), best known first; `initial` until it has loaded. */
function useAllTrails(initial: TrailDetail[]): TrailDetail[] {
  const [all, setAll] = useState<TrailDetail[] | null>(allTrailsDone);
  useEffect(() => {
    if (allTrailsDone) return;
    let cancelled = false;
    // Offline: the trips rendered with the page are still there.
    loadAllTrails().then((trips) => !cancelled && trips && setAll(trips));
    return () => {
      cancelled = true;
    };
  }, []);
  return all ?? initial;
}

/** A start this far from its table town gets the real drives from /api/drives (a town button sits on the town). */
const OFF_TOWN_M = 1000;

const goalOf = (d: TrailDetail): LatLng | null => d.trail.goal_location ?? primaryTrailhead(d)?.location ?? null;

/** One dot per mountain range for the zoomed-out map; trips outside the ranges join the closest. */
function areasOf(trails: TrailDetail[]): BrowseArea[] {
  const groups = new Map<string, { pts: LatLng[]; box: Box }>();
  const loose: LatLng[] = [];
  for (const d of trails) {
    const at = goalOf(d);
    const region = d.trail.region_name;
    if (!at || !region) continue;
    if (region.startsWith(OTHER_REGION)) {
      loose.push(at);
      continue;
    }
    // The zoom box covers whole trails, not just their goals, so a tap shows every trail of the area.
    const b = d.trail.bbox;
    const tb: Box = b ? [b.sw.lon, b.sw.lat, b.ne.lon, b.ne.lat] : [at.lon, at.lat, at.lon, at.lat];
    const g = groups.get(region);
    if (!g) groups.set(region, { pts: [at], box: tb });
    else {
      g.pts.push(at);
      g.box = [Math.min(g.box[0], tb[0]), Math.min(g.box[1], tb[1]), Math.max(g.box[2], tb[2]), Math.max(g.box[3], tb[3])];
    }
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const areas = [...groups].map(([name, { pts, box }]) => ({
    name,
    short: name.split(/,| a /)[0].trim(),
    location: { lat: median(pts.map((p) => p.lat)), lon: median(pts.map((p) => p.lon)) },
    n: pts.length,
    bbox: box,
  }));
  // Trips outside the named areas count toward the nearest one (for its size), without stretching its box.
  for (const p of loose) {
    let best = areas[0];
    let bestD = Infinity;
    for (const a of areas) {
      const d = (a.location.lat - p.lat) ** 2 + (a.location.lon - p.lon) ** 2;
      if (d < bestD) [best, bestD] = [a, d];
    }
    if (best) best.n++;
  }
  // Biggest first: when labels would overlap, the bigger area keeps its name.
  return areas.sort((a, b) => b.n - a.n).map(({ name, short, location, bbox }) => ({ name, short, location, bbox }));
}

/** The area outlines (pipeline/areas.py): they split Slovakia and give each area its dot and zoom box. */
function useAreaOutlines(): GeoJSON.FeatureCollection | null {
  const [outlines, setOutlines] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/data/map/areas.json", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => fc && setOutlines(fc))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return outlines;
}

function areasFrom(outlines: GeoJSON.FeatureCollection): BrowseArea[] {
  return outlines.features.map((f) => {
    const p = f.properties as { id: string; name: string; short: string; label: [number, number]; bbox: Box };
    return { id: p.id, name: p.name, short: p.short, location: { lon: p.label[0], lat: p.label[1] }, bbox: p.bbox };
  });
}

/** Where the home map was when the visitor left the page. */
let lastView: MapView | null = null;

/**
 * Home, map first: every trip on one map (coloured lines over the
 * grey trail network), with search, a filter menu, and a list that follows the
 * map, nearest first. Picking a day adds "Vyrazte najneskôr"; trips that don't
 * fit that day (too late or closed) are washed out after the rest. A trip with
 * no stop near it is never washed out for that (Peter 2026-10-22): by bus, it is
 * planned by car, as its trip page does.
 */
function fitsDay(i: TripCardItem): boolean {
  return !i.closed && (!i.fit || i.fit.status === "fits");
}

export function HomeExplorer({ trails: initial, knownTowns }: Props) {
  const trails = useAllTrails(initial);
  // Back on the list: stops added on a trip page don't follow into the next one.
  useEffect(() => clearAllStops(), []);
  const { date, today, withKids, easier, travel, update } = useTripSettings();
  const t = useT();
  const title = useHeadline();
  const lang = useLang();
  // Several kinds at once (testers): empty = every kind.
  const [goalFilter, setGoalFilter] = useState<DestinationKind[]>([]);
  const [diffFilter, setDiffFilter] = useState<Difficulty[]>([]);
  const [timeFilter, setTimeFilter] = useState<string[]>([]);
  const [farFilter, setFarFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [placeIndex, setPlaceIndex] = useState<PlaceSearch | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const transit = travel === "transit";
  const { start, ready: startReady, picking, setManualStart } = useUserLocation();
  const [selected, setSelected] = useState<string | null>(null);
  // The picked trip's other routes to the same place, from its own file.
  const [otherRoutes, setOtherRoutes] = useState<{ slug: string; lines: number[][][] } | null>(null);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetch(`/data/trips/${selected}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ routes?: { slug: string; up: number[][] }[] }>) : null))
      .then((t) => {
        if (cancelled) return;
        setOtherRoutes({ slug: selected, lines: (t?.routes ?? []).filter((r) => r.slug !== selected).map((r) => r.up) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected]);
  const alternatives = selected && otherRoutes?.slug === selected ? otherRoutes.lines : undefined;
  const [pointed, setPointed] = useState<string | null>(null);
  // Testers didn't see at first that the map can be tapped: a hint until the first touch, once per browser.
  const [mapHint, setMapHint] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(MAP_HINT_KEY)) setMapHint(true);
    } catch {
      // Storage blocked: no hint rather than a hint every time.
    }
  }, []);
  const dropMapHint = () => {
    if (!mapHint) return;
    setMapHint(false);
    try {
      localStorage.setItem(MAP_HINT_KEY, "1");
    } catch {
      // Storage blocked: it just shows again next visit.
    }
  };
  const [preview, setPreview] = useState<Preview | null>(null);
  // Phones: the map is a card in the page; the round button opens it full screen.
  const [fullMap, setFullMap] = useState(false);
  const mapCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fullMap) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullMap]);
  const showMapCard = useCallback(() => mapCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), []);
  // Back on the home page the map opens where it was left (kept for this visit, not stored).
  const [mapView, setMapView] = useState<MapView | null>(() => lastView);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const columnRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const pickedRef = useRef<HTMLDivElement>(null);
  // The stuck search row and picked card move with the top bar and start reminder as one piece.
  const searchRowRef = useRef<HTMLDivElement>(null);
  useDockFlip(pickedRef);
  useDockFlip(searchRowRef);
  useStuckPop(searchRowRef);
  const isDesktop = useIsDesktop();
  // Picking the start on a phone: the map goes full screen so the pin in its middle is easy to place,
  // and closes again when the start is set or picking is cancelled (Peter, 2026-10-29).
  const [pickOpened, setPickOpened] = useState(false);
  if (picking && !isDesktop && !fullMap && !pickOpened) {
    setPickOpened(true);
    setFullMap(true);
  }
  if (!picking && pickOpened) {
    setPickOpened(false);
    setFullMap(false);
  }
  const focusKey = useRef(0);
  const moveMap = useCallback((f: Omit<Extract<MapFocus, { kind: "box" }>, "key"> | Omit<Extract<MapFocus, { kind: "point" }>, "key">) => {
    focusKey.current += 1;
    setFocus({ ...f, key: focusKey.current } as MapFocus);
  }, []);

  // Drive time to every trail from the weekly precomputed table, via the town nearest the start.
  const destinations = useMemo(() => trails.map((t) => driveDestination(t)), [trails]);
  // Drive times are shown by train/bus too (muted), so the two can be compared.
  const { drives, status: driveStatus } = useTownDrives(start);
  // Away from the table town (my location, a typed place): the real drives, all in one router call.
  const offTown = start !== null && drives !== null && haversineM(start, { lat: drives.town.lat, lon: drives.town.lon }) > OFF_TOWN_M;
  const startDrives = useStartDrives(start, offTown);

  const { listedAll, noneFit } = useMemo(() => {
    const now = new Date();
    // Far from its table town the time is a rougher guess: shown with "~".
    const town: LatLng | null = drives ? { lat: drives.town.lat, lon: drives.town.lon } : null;
    const toTownKm = start && town ? haversineM(start, town) / 1000 : null;
    const all = trails.flatMap((detail, i): TripCardItem[] => {
      const dest = destinations[i];
      const stop = nearestStop(detail);
      if (easier && !detail.trail.family_friendly) return [];
      if (goalFilter.length > 0 && !goalFilter.includes(detail.trail.goal ?? "ine")) return [];
      // Another, easier route to the place counts too, and the card says so (A13, Peter 2026-10-26).
      const viaEasier = diffFilter.length > 0 && !diffFilter.includes(detail.trail.difficulty) && !!detail.trail.easier && diffFilter.includes(detail.trail.easier.difficulty);
      if (diffFilter.length > 0 && !diffFilter.includes(detail.trail.difficulty) && !viaEasier) return [];
      // The trip page's own route once it was opened from this start (the same number on both pages),
      // else the real drive from this start (/api/drives, away from the table towns),
      // else the trip page's first guess: the weekly table from the nearest town, or a straight-line estimate.
      const exact = start && dest ? (knownDriveMin(start, dest) ?? startDrives?.[detail.trail.slug] ?? null) : null;
      const table = drives?.minutes[detail.trail.slug] ?? null;
      const estimate = exact === null && table === null && driveStatus !== "loading" && start !== null && dest !== null;
      const carMin =
        exact ?? (start && dest && (table !== null || estimate) ? quickDriveMin(start, dest, table !== null ? drives : null, table) : null);
      const approx = exact === null && (estimate || (table !== null && toTownKm! > TOWN_EXACT_KM));
      // By bus or train: an estimate from the road time (no timetables yet), so the day still counts the ride.
      // No stop near the trail: by car after all, like the trip page.
      const byBus = transit && stop !== null;
      const driveMin = byBus ? (carMin !== null ? transitMinutes(carMin) : null) : carMin;
      // The walk the trip page counts: from the parking (by car) or the stop (by train/bus), the walk to the trail and back included.
      const walk = pickWalk(routeWalk(detail), byBus, detail.parkingLots.length > 0);
      const hikeMin = walk ? walkMinutes(walk, withKids) : hikeMinutes(detail.trail.duration_min, withKids);
      // A clearly shorter route to the same place (its own trip page): the place fits a short-walk filter through it.
      const short = detail.trail.shorter?.[byBus ? "bus" : "car"];
      const shortMin = short ? hikeMinutes(short.min, withKids) : null;
      const fitsTime = (m: number | null) => m !== null && TIME_FILTERS.some((f) => timeFilter.includes(f.key) && m >= f.min && m <= f.max);
      if (timeFilter.length > 0 && !fitsTime(hikeMin) && !fitsTime(shortMin)) return [];
      if (farFilter !== null && start && driveMin !== null && driveMin > farFilter) return [];
      const th = primaryTrailhead(detail);
      const sun = sunLocation(detail);
      return [
        {
          detail,
          hikeMin,
          shortMin,
          easierRoute: viaEasier ? detail.trail.easier!.difficulty : null,
          walkM: walk?.m ?? detail.trail.distance_m,
          ascentM: walk?.ascentM ?? detail.trail.ascent_m,
          driveMin,
          carMin,
          driveApprox: approx,
          driveLoading: driveStatus === "loading",
          distanceM: start && th ? haversineM(start, th.location) : null,
          fit: date && today && sun ? dayFit({ date, now, driveMin, hikeMin, location: sun }) : null,
          closed: date !== null && activeClosures(detail.closures, date).length > 0,
          stop: byBus ? stop : null,
          nearStop: stop,
          noStop: transit && !stop,
        },
      ];
    });
    if (start) {
      const key = (i: TripCardItem) => i.carMin ?? (i.distanceM ?? Infinity) / 1000;
      all.sort((a, b) => key(a) - key(b));
    }
    const out = (i: TripCardItem) => i.closed;
    const open = all.filter((i) => !out(i));
    const fitting = open.filter(fitsDay);
    // Trips the day is too short for, then closed ones, stay on the map and in
    // the list, washed out, after the ones that fit; so a search for Rysy in winter still finds it.
    const late = open.filter((i) => !fitsDay(i));
    const noneFit = fitting.length === 0 && open.length > 0;
    return { listedAll: [...fitting, ...late, ...all.filter(out)], noneFit };
  }, [trails, destinations, drives, startDrives, driveStatus, withKids, easier, goalFilter, diffFilter, timeFilter, farFilter, date, today, start, transit]);

  const bySlug = useMemo(() => new Map(listedAll.map((i) => [i.detail.trail.slug, i])), [listedAll]);

  // The list: what the search finds anywhere, else the trips on the map and a little around it.
  // Typing stays quick: the list follows a beat behind the keys on slow phones.
  const deferredQuery = useDeferredValue(query);
  const words = useMemo(() => plain(deferredQuery).split(/\s+/).filter(Boolean), [deferredQuery]);
  // Each trip's searchable name, made once per list rather than on every key press.
  const nameKeys = useMemo(() => new Map(trails.map((d) => [d, plain(`${d.trail.name} ${d.trail.region_name ?? ""}`)])), [trails]);
  // Places on and by the trips (starts, car parks, stops, huts): fetched once someone starts searching.
  const wantsPlaces = searchOpen || words.length > 0;
  useEffect(() => {
    if (!wantsPlaces || placeIndex) return;
    let cancelled = false;
    fetch("/data/search.json")
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndexFile>) : null))
      .then((f) => {
        if (f && !cancelled) setPlaceIndex(preparePlaces(f));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wantsPlaces, placeIndex]);
  const placeResults = useMemo(() => (placeIndex ? searchPlaces(placeIndex, words) : null), [placeIndex, words]);
  const nameMatches = useCallback(
    (d: TrailDetail) => {
      const key = nameKeys.get(d) ?? plain(`${d.trail.name} ${d.trail.region_name ?? ""}`);
      return words.every((w) => key.includes(w));
    },
    [words, nameKeys]
  );
  // A trip matches by its name, or by a place it starts, passes or ends at (and the places right by it).
  const matches = useCallback(
    (d: TrailDetail) => nameMatches(d) || Boolean(placeResults?.slugs.has(d.trail.slug)),
    [nameMatches, placeResults]
  );
  const scoped = useMemo(() => {
    // A trip named like the search comes first, even when it is closed or too long that day.
    if (words.length > 0) {
      const found = listedAll.filter((i) => matches(i.detail));
      return [...found.filter((i) => nameMatches(i.detail)), ...found.filter((i) => !nameMatches(i.detail))];
    }
    if (!mapView || mapView.zoom < mapView.areaZoom - 1) return listedAll;
    // With a start, the trips on the map (and a little around it) in the order of the
    // rest of the list: nearest to the start first, not to the map centre (Peter, 2026-10-26).
    if (start) {
      const [w, s, e, n] = mapView.bounds;
      const padX = Math.max((e - w) * 0.25, (LIST_MIN_HALF_KM - (e - w) * 37) / 74);
      const padY = Math.max((n - s) * 0.25, (LIST_MIN_HALF_KM - (n - s) * 55.6) / 111.2);
      const inView = listedAll.filter((i) => {
        const at = goalOf(i.detail);
        return !!at && at.lon >= w - padX && at.lon <= e + padX && at.lat >= s - padY && at.lat <= n + padY;
      });
      if (inView.length > 0) return inView;
    }
    const [lon, lat] = mapView.center;
    const score = (i: TripCardItem) => {
      const at = goalOf(i.detail);
      return at ? haversineM({ lat, lon }, at) / 1000 - KM_PER_RANK * (i.detail.trail.rank ?? 0) : Infinity;
    };
    // Best first; trips the day is too short for stay after the ones that fit, as on the rest of the list.
    const ranked = listedAll.map((i) => ({ i, s: score(i), late: !fitsDay(i) }));
    ranked.sort((a, b) => Number(a.late) - Number(b.late) || a.s - b.s);
    return ranked.filter((r) => r.s < Infinity).map((r) => r.i);
  }, [listedAll, words, matches, nameMatches, mapView, start]);

  // Cards come in pages; a new filter or another part of the map starts again from the first page.
  const filterKey = [goalFilter.join(), diffFilter.join(), timeFilter.join(), farFilter, withKids, easier, date, travel, query].join("|");
  const [paging, setPaging] = useState({ key: filterKey, n: PAGE });
  const limit = paging.key === filterKey ? paging.n : PAGE;
  const visible = useMemo(() => {
    const page = scoped.slice(0, limit);
    // A trip picked on the map is always in the list, first if it would not be shown.
    const picked = selected ? bySlug.get(selected) : undefined;
    return picked && !page.includes(picked) ? [picked, ...page] : page;
  }, [scoped, limit, selected, bySlug]);

  const season = seasonOf(date ? new Date(`${date}T12:00`) : new Date());
  const dayWord = date && today ? dayInSentence(date, new Date(), lang) : null;

  // The map: every trip that passes the filters; the ones the day is too short for washed out.
  const mapTrips = useMemo<BrowseTrip[]>(
    () =>
      listedAll.flatMap((item) => {
        const { detail } = item;
        const at = goalOf(detail);
        const th = primaryTrailhead(detail);
        if (!at) return [];
        const dim = !fitsDay(item);
        return [{ slug: detail.trail.slug, goal: detail.trail.goal ?? "ine", rank: detail.trail.rank ?? 0, location: at, start: th?.location ?? at, dim, closed: item.closed }];
      }),
    [listedAll]
  );
  const outlines = useAreaOutlines();
  // Until the outlines arrive (or if they can't), the dots come from the trips themselves.
  const areas = useMemo(() => (outlines ? areasFrom(outlines) : areasOf(trails)), [outlines, trails]);

  const registerItem = useCallback((slug: string, el: HTMLElement | null) => {
    if (el) itemRefs.current.set(slug, el);
    else itemRefs.current.delete(slug);
  }, []);

  const tripBox = useCallback((d: TrailDetail): Box | null => {
    const b = d.trail.bbox;
    return b ? [b.sw.lon, b.sw.lat, b.ne.lon, b.ne.lat] : null;
  }, []);

  /** Pick a trip: on a phone its preview opens; on a computer the line and its card light up. */
  const pickTrip = useCallback(
    (slug: string | null, also: string[] = [], at = { x: 0, y: 0 }) => {
      setSelected(slug);
      if (!slug) {
        setPreview(null);
        return;
      }
      if (isDesktop) {
        setPreview(null);
        requestAnimationFrame(() => pickedRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      } else {
        setPreview({ kind: "trip", slug, also, ...at, peek: false });
      }
    },
    [isDesktop]
  );

  const goToTrip = useCallback(
    (slug: string) => {
      const item = bySlug.get(slug);
      const box = item ? tripBox(item.detail) : null;
      if (!isDesktop) showMapCard();
      if (box) moveMap({ kind: "box", bbox: box, maxZoom: 13 });
      pickTrip(slug);
    },
    [bySlug, tripBox, isDesktop, moveMap, pickTrip, showMapCard]
  );

  // ---- search: trips, mountain ranges, towns
  const towns = useMemo(() => getTowns(), []);
  const results = useMemo(() => {
    if (words.length === 0) return null;
    const has = (s: string) => words.every((w) => plain(s).includes(w));
    const first = (s: string) => plain(s).startsWith(words[0]) || plain(s).includes(` ${words[0]}`);
    const ranges = areas.filter((a) => has(a.name)).slice(0, 3);
    // trip names first, then trips at the typed place, then trips at the places next to it
    const atPlace = new Set(placeResults?.hits.flatMap((h) => h.place.trips));
    const named = (d: TrailDetail) =>
      Number(nameMatches(d)) * 4 + Number(first(d.trail.name)) * 2 + Number(atPlace.has(d.trail.slug));
    const trips = listedAll
      .filter((i) => matches(i.detail))
      .sort((a, b) => named(b.detail) - named(a.detail) || (b.detail.trail.rank ?? 0) - (a.detail.trail.rank ?? 0))
      .slice(0, 6);
    const places = towns.filter((t) => has(t.name)).slice(0, 3);
    return { ranges, trips, places };
  }, [words, areas, listedAll, matches, nameMatches, towns, placeResults]);

  // A known town typed into the search offers "Vyrážam z …": a start, not only a move of the map.
  const townMatch = useMemo(() => (plain(query).trim().length >= 3 ? (suggestTowns(query, towns, 1)[0] ?? null) : null), [query, towns]);
  const townTracked = useRef(false);
  useEffect(() => {
    if (!townMatch) {
      townTracked.current = false;
      return;
    }
    if (townTracked.current) return;
    townTracked.current = true;
    track("trip_search_town");
  }, [townMatch]);
  // One "trip_search" per typed text, whether it came from Enter or from tapping a result.
  const searchedFor = useRef("");
  const noteSearch = (hit: boolean) => {
    const q = plain(query).trim();
    if (!q || q === searchedFor.current) return;
    searchedFor.current = q;
    track("trip_search", { result: hit ? "hit" : "miss" });
  };

  const closeMenus = useCallback(() => {
    setSearchOpen(false);
    setFiltersOpen(false);
  }, []);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!toolsRef.current?.contains(e.target as Node)) closeMenus();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [closeMenus]);

  const showOnMap = (focusTo: Parameters<typeof moveMap>[0]) => {
    noteSearch(true);
    setQuery("");
    closeMenus();
    setPreview(null);
    if (!isDesktop) showMapCard();
    moveMap(focusTo);
  };

  const filterCount = goalFilter.length + diffFilter.length + timeFilter.length + (farFilter !== null && start ? 1 : 0);
  // C83: the list came back empty. Only fixed choices go out (why + how many filters), never typed text or places.
  useEffect(() => {
    if (visible.length === 0) trackListEmpty({ why: listedAll.length === 0 ? "filters" : "map", filters: filterCount });
  }, [visible.length, listedAll.length, filterCount]);

  const zoomedIn = !!mapView && mapView.zoom >= mapView.areaZoom - 1;
  const heading = words.length > 0
    ? t("Výsledky pre „{q}“", { q: query.trim() })
    : zoomedIn
      ? start
        ? dayWord && !noneFit
          ? t("Stihnete {day}, na mape najbližšie k vášmu štartu", { day: dayWord })
          : t("Na mape, najbližšie k vášmu štartu")
        : dayWord && !noneFit
          ? t("Stihnete {day}, najbližšie k stredu mapy", { day: dayWord })
          : t("Najbližšie k stredu mapy")
      : dayWord && !noneFit
        ? t(start ? "Stihnete {day}, najbližšie prvé" : "Stihnete {day}", { day: dayWord })
        : start
          ? t("Najbližšie výlety")
          : t("Tisíce výletov po celom Slovensku");

  const pickedItem = isDesktop && selected ? bySlug.get(selected) : undefined;

  const cardList = (items: TripCardItem[]) =>
    items.map((item) => (
      <TripCard
        key={item.detail.trail.id}
        item={item}
        dayWord={dayWord}
        transit={transit}
        active={isDesktop && selected === item.detail.trail.slug}
        onActive={setPointed}
        registerItem={registerItem}
      />
    ));

  const previewTrip = preview?.kind === "trip" ? bySlug.get(preview.slug) : undefined;
  const sheet = preview && !isDesktop && (preview.kind === "trail" || previewTrip) && (
    <div role="dialog" aria-label={t("Náhľad výletu")} className="absolute inset-x-0 bottom-0 z-10 flex max-h-[70%] flex-col gap-3 overflow-y-auto rounded-t-[20px] border border-[var(--border)] bg-[var(--card-bg)] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between gap-3">
        <span className="mx-auto -mt-1 h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden />
      </div>
      {previewTrip ? (
        <>
          <MiniCard item={previewTrip} />
          <LangLink
            href={`/trasa/${previewTrip.detail.trail.slug}`}
            className="rounded-full bg-[var(--accent)] px-4 py-3 text-center text-[15px] font-bold text-[var(--accent-contrast)]"
          >
            {t("Vybrať tento výlet")}
          </LangLink>
          {preview.kind === "trip" && preview.also.length > 0 && (
            <OtherTrips title={t("Týmto miestom vedú aj")} items={preview.also.flatMap((s) => (bySlug.get(s) ? [{ item: bySlug.get(s)!, note: null }] : []))} onPick={goToTrip} />
          )}
        </>
      ) : (
        preview.kind === "trail" && (
          <>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--segment-bg)] text-[var(--muted)]" aria-hidden>
                <UiIcon name="boot" size={22} />
              </span>
              <div>
                <h3 className="text-lg leading-tight font-bold">{t("Značený chodník")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("Tento kúsok zatiaľ nie je v žiadnom našom výlete.")}</p>
              </div>
            </div>
            <OtherTrips
              title={preview.nearby.length ? t("Výlety v okolí") : t("V okolí zatiaľ nemáme výlet.")}
              items={preview.nearby.flatMap((n) => (bySlug.get(n.slug) ? [{ item: bySlug.get(n.slug)!, note: t("{km} km odtiaľto", { km: decimal(lang, n.km) }) }] : []))}
              onPick={goToTrip}
            />
          </>
        )
      )}
      <button type="button" onClick={() => pickTrip(null)} aria-label={t("Zavrieť")} className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-[var(--segment-bg)]">
        <UiIcon name="close" size={14} />
      </button>
    </div>
  );

  // Computer: a small card next to the pointer (hover), or the "no trip here" card next to a clicked grey trail,
  // kept inside the map near its right and bottom edges.
  const peekTrip = isDesktop && preview?.kind === "trip" && preview.peek ? previewTrip : undefined;
  const popover = isDesktop && preview && (peekTrip || preview.kind === "trail") && (
    <div
      className={`absolute z-10 w-[300px] rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-3 shadow-[var(--shadow-float)] ${peekTrip ? "pointer-events-none" : ""}`}
      style={{ left: `min(${preview.x + 18}px, calc(100% - 308px))`, top: `max(8px, min(${preview.y - 60}px, calc(100% - ${peekTrip ? 110 : 300}px)))` }}
    >
      {peekTrip ? (
        <MiniCard item={peekTrip} />
      ) : (
        preview.kind === "trail" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold">{t("Značený chodník")}</h3>
                <p className="text-sm text-[var(--muted)]">{t("Tento kúsok zatiaľ nie je v žiadnom našom výlete.")}</p>
              </div>
              <button type="button" onClick={() => setPreview(null)} aria-label={t("Zavrieť")} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--segment-bg)]">
                <UiIcon name="close" size={12} />
              </button>
            </div>
            <OtherTrips
              title={preview.nearby.length ? t("Výlety v okolí") : t("V okolí zatiaľ nemáme výlet.")}
              items={preview.nearby.flatMap((n) => (bySlug.get(n.slug) ? [{ item: bySlug.get(n.slug)!, note: t("{km} km odtiaľto", { km: decimal(lang, n.km) }) }] : []))}
              onPick={goToTrip}
            />
          </div>
        )
      )}
    </div>
  );

  const map = (
    <div className="relative h-full w-full" onPointerDownCapture={dropMapHint} onWheelCapture={dropMapHint}>
      <p className="sr-only">{t("Mapa ukazuje tie isté výlety ako zoznam výletov.")}</p>
      <BrowseMap
        trips={mapTrips}
        areas={areas}
        outlines={outlines}
        selected={selected}
        alternatives={alternatives}
        highlighted={pointed}
        focus={focus}
        initialView={mapView}
        onView={(v) => {
          lastView = v;
          // The list follows the map without holding up the next frame of a pinch.
          startTransition(() => setMapView(v));
        }}
        onPick={(p) => (p ? pickTrip(p.slug, p.also, p) : pickTrip(null))}
        onHover={(h) => {
          setPointed(h?.slug ?? null);
          if (selected) return;
          setPreview((prev) => (h ? { kind: "trip", slug: h.slug, also: [], x: h.x, y: h.y, peek: true } : prev?.kind === "trip" && prev.peek ? null : prev));
        }}
        onTrailTap={(t) => {
          setSelected(null);
          setPreview({ kind: "trail", ...t });
        }}
        bottomInset={isDesktop ? 0 : SHEET_INSET}
        waitForUse={!isDesktop}
        ariaLabel={t("Mapa všetkých výletov")}
      />
      <div
        className="pointer-events-none absolute left-3 z-[5] flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-2.5 py-1.5 text-[11px] text-[var(--muted)] shadow-[var(--shadow-float)]"
        style={{ top: fullMap ? "calc(12px + env(safe-area-inset-top))" : 12 }}
        aria-hidden
      >
        <span className="flex items-center gap-1.5">
          {t("málo chodené")} <PopularityKey /> {t("obľúbené")}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="block h-[3px] w-5 rounded-full bg-[#8a8f7a] opacity-60" /> {t("chodník bez výletu")}
        </span>
      </div>
      {mapHint && !picking && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[5] -translate-x-1/2 rounded-full bg-[#14233b]/90 px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-white shadow-[var(--shadow-float)]" role="note">
          {isDesktop ? t("Kliknite na oblasť alebo trasu na mape") : t("Ťuknite na oblasť alebo trasu na mape")}
        </div>
      )}
      {sheet}
      {popover}
    </div>
  );

  const tools = (
    <div ref={toolsRef} className="relative flex flex-col gap-2">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t("Hľadať výlet alebo pohorie")}</span>
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--muted)]">
            <UiIcon name="search" size={18} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
              setFiltersOpen(false);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
              if (e.key === "Enter" && results) {
                noteSearch(results.ranges.length + results.trips.length + results.places.length > 0);
                const r = results.ranges[0];
                const t = results.trips[0];
                if (t) {
                  setQuery("");
                  closeMenus();
                  goToTrip(t.detail.trail.slug);
                } else if (r) showOnMap({ kind: "box", bbox: r.bbox, maxZoom: 11 });
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={t("Hľadať výlet alebo pohorie")}
            autoComplete="off"
            className="h-11 w-full rounded-full border border-[var(--border)] bg-[var(--card-bg)] pr-2 pl-9 text-[14px] shadow-[var(--shadow-float)] min-[400px]:pr-3 min-[400px]:pl-10 min-[400px]:text-[15px] lg:shadow-none"
          />
        </label>
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => {
            setFiltersOpen((v) => !v);
            setSearchOpen(false);
          }}
          className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold shadow-[var(--shadow-float)] lg:shadow-none ${
            filterCount ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] bg-[var(--card-bg)]"
          }`}
        >
          <UiIcon name="filter" size={16} />
          {/* Under 380 px the word gives its room to the search placeholder; it is still read out. */}
          <span className="max-[379px]:sr-only">{filterCount ? `${t("Filtre")} · ${filterCount}` : t("Filtre")}</span>
          {filterCount ? (
            <span aria-hidden="true" className="min-[380px]:hidden">
              {filterCount}
            </span>
          ) : null}
        </button>
      </div>


      {searchOpen && results && (
        <div role="listbox" aria-label={t("Výsledky hľadania")} className="absolute top-12 right-0 left-0 z-30 max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-2 shadow-[var(--shadow-float)]">
          {townMatch && (
            <MenuRow
              onClick={() => {
                setManualStart({ lat: townMatch.location.lat, lon: townMatch.location.lon, label: townMatch.name }, "suggestion");
                noteSearch(true);
                setQuery("");
                closeMenus();
              }}
              icon={<UiIcon name="pin" size={16} />}
              title={t("Vyrážam {from}", { from: townFrom(lang, townMatch.id, townMatch.name) })}
              note={t("Nastaviť ako štart a zoradiť výlety podľa cesty")}
            />
          )}
          {results.ranges.length > 0 && <MenuTitle>{t("Pohoria")}</MenuTitle>}
          {results.ranges.map((a) => (
            <MenuRow key={a.name} onClick={() => showOnMap({ kind: "box", bbox: a.bbox, maxZoom: 11 })} icon={<UiIcon name="up" size={16} />} title={a.name} note={t("Ukázať výlety v pohorí na mape")} />
          ))}
          {results.trips.length > 0 && <MenuTitle>{t("Výlety")}</MenuTitle>}
          {results.trips.map(({ detail, hikeMin }) => (
            <MenuRow
              key={detail.trail.slug}
              onClick={() => {
                noteSearch(true);
                setQuery("");
                closeMenus();
                goToTrip(detail.trail.slug);
              }}
              icon={<GoalTile goal={detail.trail.goal ?? "ine"} size={28} />}
              title={detail.trail.name}
              note={`${t(GOAL_LABEL[detail.trail.goal ?? "ine"])} · ${detail.trail.region_name ?? ""} · ${formatDurationShort(hikeMin)}`}
            />
          ))}
          {results.places.length > 0 && <MenuTitle>{t("Obce a mestá")}</MenuTitle>}
          {results.places.map((town) => (
            <MenuRow key={town.id} onClick={() => showOnMap({ kind: "point", location: town.location, zoom: 10.5 })} icon={<UiIcon name="pin" size={16} />} title={town.name} note={t("Ukázať výlety okolo na mape")} />
          ))}
          {results.ranges.length + results.trips.length + results.places.length === 0 && !townMatch && (
            <p className="p-2 text-sm text-[var(--muted)]">{t("Nič sa nenašlo. Skúste názov vrchu, chaty, pohoria alebo obce.")}</p>
          )}
        </div>
      )}

      {filtersOpen && (
        <div className="absolute top-12 right-0 left-0 z-30 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-2 shadow-[var(--shadow-float)]">
          <MenuTitle>{t("Cieľ")}</MenuTitle>
          <div className="grid grid-cols-2">
            {[null, ...GOAL_FILTERS].map((g) => (
              <label key={g ?? "all"} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-[15px] hover:bg-[var(--segment-bg)]">
                <input
                  type="checkbox"
                  checked={g === null ? goalFilter.length === 0 : goalFilter.includes(g)}
                  onChange={(e) => setGoalFilter((prev) => (g === null ? [] : e.target.checked ? [...prev, g] : prev.filter((x) => x !== g)))}
                  className="h-[18px] w-[18px] accent-[var(--accent)]"
                />
                {g && <span className="h-3 w-3 rounded-[3px]" style={{ background: GOAL_COLOUR[g] }} />}
                {g ? t(GOAL_PLURAL[g]) : t("Všetky ciele")}
              </label>
            ))}
          </div>
          <MenuTitle>{t("Náročnosť")}</MenuTitle>
          <div className="grid grid-cols-2">
            {DIFFICULTIES.map((d) => (
              <label key={d} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-[15px] hover:bg-[var(--segment-bg)]">
                <input
                  type="checkbox"
                  checked={diffFilter.includes(d)}
                  onChange={(e) => setDiffFilter((prev) => (e.target.checked ? [...prev, d] : prev.filter((x) => x !== d)))}
                  className="h-[18px] w-[18px] accent-[var(--accent)]"
                />
                {t(DIFFICULTY_LABEL[d])}
              </label>
            ))}
          </div>
          <MenuTitle>{t("Čas na trase")}</MenuTitle>
          <div className="grid grid-cols-2">
            {TIME_FILTERS.map((f) => (
              <label key={f.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-[15px] hover:bg-[var(--segment-bg)]">
                <input
                  type="checkbox"
                  checked={timeFilter.includes(f.key)}
                  onChange={(e) => setTimeFilter((prev) => (e.target.checked ? [...prev, f.key] : prev.filter((x) => x !== f.key)))}
                  className="h-[18px] w-[18px] accent-[var(--accent)]"
                />
                {t(f.label)}
              </label>
            ))}
          </div>
          <MenuTitle>{transit ? t("Cesta autobusom či vlakom") : t("Cesta autom")}</MenuTitle>
          {start ? (
            <div className="grid grid-cols-2">
              {[null, ...FAR_FILTERS].map((m) => (
                <label key={m ?? "all"} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-[15px] hover:bg-[var(--segment-bg)]">
                  <input type="radio" name="far" checked={farFilter === m} onChange={() => setFarFilter(m)} className="h-[18px] w-[18px] accent-[var(--accent)]" />
                  {m === null ? t("Hocijako ďaleko") : m < 60 ? t("do {t} min", { t: m }) : t("do {t} h", { t: decimal(lang, m / 60, Number.isInteger(m / 60) ? 0 : 1) })}
                </label>
              ))}
            </div>
          ) : (
            <p className="p-2 text-sm text-[var(--muted)]">{t("Najprv vyberte, odkiaľ vyrážate.")}</p>
          )}
          <div className="sticky -bottom-2 mt-1 -mb-2 flex justify-between gap-2 border-t border-[var(--border)] bg-[var(--card-bg)] p-2">
            <button
              type="button"
              onClick={() => {
                setGoalFilter([]);
                setDiffFilter([]);
                setTimeFilter([]);
                setFarFilter(null);
              }}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold"
            >
              {t("Zrušiť filtre")}
            </button>
            <button type="button" onClick={() => setFiltersOpen(false)} className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-contrast)]">
              {t("Hotovo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const focusStart = () => {
    const box = document.querySelector<HTMLElement>("[data-start-chip]");
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    box?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  };

  const showTomorrow = () => {
    update({ date: addDaysIso(isoDate(new Date()), 1) });
  };

  const list = (
    <section id="vylety" tabIndex={-1} className="flex flex-col gap-3 outline-none">
      {/* Only the heading is read out when the list changes, not every card in it. */}
      <div className="flex flex-col" aria-live="polite">
        <h2 className="text-base font-bold">{heading}</h2>
      </div>

      {/* No start: the drive (and bus) to each trip can't be worked out yet, so say so before the list (Peter, 2026-10-26). */}
      {startReady && !start && words.length === 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
          <p className="font-semibold">{t("Nevieme, odkiaľ vyrážate, preto zatiaľ neukazujeme čas cesty autom ani autobusom.")}</p>
          <button type="button" onClick={focusStart} className="font-semibold underline">
            {t("Zadať štart")}
          </button>
        </div>
      )}

      {noneFit && dayWord && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] bg-[var(--warn-bg)] p-3 text-sm text-[var(--warn)]">
          <p className="font-semibold">
            {date === today
              ? t("Dnes už za svetla nestihnete žiadny výlet. Ukazujeme všetky.")
              : t("{Day} za svetla nestihnete žiadny výlet. Ukazujeme všetky.", { Day: dayWord.charAt(0).toUpperCase() + dayWord.slice(1) })}
          </p>
          {date === today && (
            <button type="button" onClick={showTomorrow} className="font-semibold underline">
              {t("Pozrieť zajtra")}
            </button>
          )}
        </div>
      )}

      {visible.length === 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] p-4 text-sm">
          <p>
            {listedAll.length === 0 ? t("S týmito filtrami nič nenachádzame.") : t("Tu nič nie je. Posuňte mapu alebo hľadajte inde.")}
          </p>
          <div className="flex flex-wrap gap-3">
            {filterCount > 0 && (
              <button type="button" onClick={() => { setGoalFilter([]); setDiffFilter([]); }} className="font-semibold text-[var(--accent)] underline">
                {t("Zrušiť filtre")}
              </button>
            )}
            {easier && (
              <button type="button" onClick={() => update({ easier: false })} className="font-semibold text-[var(--accent)] underline">
                {t("Ukázať aj náročnejšie trasy")}
              </button>
            )}
            {date === today && (
              <button type="button" onClick={showTomorrow} className="font-semibold text-[var(--accent)] underline">
                {t("Pozrieť zajtra")}
              </button>
            )}
          </div>
        </div>
      )}

      {pickedItem && (
        // Picked on the map: a bigger card that stays on top while the list scrolls under it.
        <div ref={pickedRef} className="sticky top-[calc(var(--topbar,0px)+var(--startbar,0px))] z-10 -mx-1 bg-[var(--background)] px-1 pt-1 pb-2">
          <TripCard
            item={pickedItem}
            dayWord={dayWord}
            transit={transit}
            active
            onClose={() => pickTrip(null)}
            onActive={setPointed}
            registerItem={registerItem}
          />
        </div>
      )}

      {cardList(pickedItem ? visible.filter((i) => i !== pickedItem) : visible)}

      {scoped.length > limit && (
        <button
          type="button"
          onClick={() => setPaging({ key: filterKey, n: limit + PAGE })}
          className="w-fit self-center rounded-full border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2 text-sm font-semibold text-[var(--accent)]"
        >
          {t("Ukázať ďalšie")}
        </button>
      )}

    </section>
  );

  return (
    <main className="flex flex-1 flex-col lg:h-dvh lg:flex-none lg:flex-row lg:overflow-hidden">
      <div ref={columnRef} className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pt-4 pb-6 md:max-w-[760px] lg:mx-0 lg:w-[440px] lg:max-w-none lg:shrink-0 relative lg:overflow-y-auto lg:overscroll-contain">
        <PullSky season={season} />
        <SkyEdge colour={LAND[season].sky1} />
        <header className="relative -mx-4 -mt-4 flex shrink-0 flex-col sm:overflow-hidden sm:rounded-b-[24px] lg:overflow-visible lg:rounded-none">
          <SeasonScene season={season} width={440} height={250} seed={11} sunX={HEADER_SUN_X} sunY={0.26} drop={0.2} noSun className="absolute inset-0 h-full w-full" />
          <SunPull season={season} width={440} height={250} sunX={HEADER_SUN_X} sunY={0.26} moveRef={columnRef} />
          <nav aria-label={t("Hlavná navigácia")} className="relative flex items-center justify-between gap-3 px-4 pt-4">
            <LangLink href="/" aria-label="Túruj" className="block">
              {/* Name only: the seasonal mark blends into the header scene. The hero sky is light in both themes, so dark ink always. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/turuj-wordmark.svg" alt="Túruj" width={61} height={26} className="h-[26px] w-auto" />
            </LangLink>
          </nav>
          <div className="relative flex flex-col gap-2 px-4 pt-6 pb-16 text-[#14233b]">
            <h1 className="text-[2.15rem] leading-none font-extrabold tracking-tight" data-hl={JSON.stringify(HEADLINES.map((h) => t(h)))} suppressHydrationWarning>
              {t(title)}
            </h1>
            <script dangerouslySetInnerHTML={{ __html: PICK_HEADLINE }} />
            <p className="max-w-[30ch] text-[15px] font-medium">{t("Výlety, z ktorých budete späť za svetla.")}</p>
          </div>
        </header>

        <div className="relative z-[1] -mx-1 -mt-14">
          <StartChip />
        </div>

        <div className="-mx-1 flex flex-col gap-3 rounded-[18px] bg-[var(--card-bg)] p-3 shadow-[var(--shadow-float)]">
          <FilterChips />
          <KidsRow forList />
        </div>

        <TownButton start={start} knownTowns={knownTowns} />

        {startReady && !start && <StartReminder />}

        {/* Search, filters and Mapa / Zoznam stay on top while the map fills the screen. */}
        <div ref={searchRowRef} className="sticky top-[calc(var(--topbar,0px)+var(--startbar,0px))] z-20 -mx-4 px-4 py-2 lg:static lg:mx-0 lg:p-0">
          {tools}
        </div>

        {!isDesktop && (
          // A card with gutters: a thumb beside it still scrolls the page past the map.
          <div
            ref={mapCardRef}
            className={
              fullMap
                ? "fixed inset-0 z-50 bg-[var(--background)] pt-[env(safe-area-inset-top)]"
                : "relative h-[58vh] max-h-[560px] min-h-[340px] md:max-h-[720px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)]"
            }
          >
            {map}
            <MapExpandButton full={fullMap} onClick={() => setFullMap((v) => !v)} />
          </div>
        )}

        {list}

        <SiteFooter />
        <AppBar hidden={isDesktop || fullMap || !!sheet} />
      </div>

      {isDesktop && <div className="sticky top-0 h-dvh flex-1 border-l border-[var(--border)]">{map}</div>}
    </main>
  );
}

function GoalTile({ goal, size }: { goal: DestinationKind; size: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-lg text-white"
      style={{ background: GOAL_COLOUR[goal], width: size, height: size }}
      // Constant markup from lib/kindIcons.ts, no user data.
      dangerouslySetInnerHTML={{ __html: kindSvg(goal, Math.round(size * 0.62)) }}
    />
  );
}

function MenuTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="mx-2 mt-2 mb-1 text-[11px] font-bold tracking-wide text-[var(--muted)] uppercase">{children}</h4>;
}

function MenuRow({ icon, title, note, onClick }: { icon: React.ReactNode; title: string; note: string; onClick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={false} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-[var(--segment-bg)]">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--segment-bg)] text-[var(--muted)]">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-xs text-[var(--muted)]">{note}</span>
      </span>
    </button>
  );
}

/** The trip in a preview: name, what and where, how long. */
function MiniCard({ item }: { item: TripCardItem }) {
  const t = useT();
  const { trail } = item.detail;
  const goal = trail.goal ?? "ine";
  return (
    <div className="flex items-start gap-3 pr-8">
      <GoalTile goal={goal} size={44} />
      <div className="min-w-0">
        <h3 className="text-lg leading-tight font-bold">{trail.name}</h3>
        <p className="text-[13px] text-[var(--muted)]">
          {t(GOAL_LABEL[goal])}
          {trail.region_name ? ` · ${trail.region_name}` : ""}
        </p>
        <p className="font-data mt-1 flex flex-wrap gap-x-3 text-sm font-semibold">
          {item.carMin !== null && (
            <span className="inline-flex items-center gap-1">
              <UiIcon name="car" size={14} />
              {item.driveApprox ? "~" : ""}
              {formatDurationShort(item.carMin)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <UiIcon name="boot" size={14} />
            {formatDurationShort(item.hikeMin)}
          </span>
          <span>{formatKm(item.walkM, useLang())}</span>
          <span>{t(DIFFICULTY_LABEL[trail.difficulty])}</span>
        </p>
      </div>
    </div>
  );
}

function OtherTrips({ title, items, onPick }: { title: string; items: { item: TripCardItem; note: string | null }[]; onPick: (slug: string) => void }) {
  const t = useT();
  return (
    <div className="border-t border-[var(--border)] pt-2">
      <p className="text-xs font-semibold text-[var(--muted)]">{title}</p>
      {items.map(({ item, note }) => {
        const { trail } = item.detail;
        return (
          <button key={trail.slug} type="button" onClick={() => onPick(trail.slug)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-[var(--segment-bg)]">
            <GoalTile goal={trail.goal ?? "ine"} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{trail.name}</span>
              <span className="block text-xs text-[var(--muted)]">
                {note ? `${note} · ` : ""}
                {formatDurationShort(item.hikeMin)} · {t(DIFFICULTY_LABEL[trail.difficulty])}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The map key: the five popularity levels as on the map, the quiet two dotted and dashed. */
function PopularityKey() {
  return (
    <svg width="56" height="8" viewBox="0 0 56 8" className="block">
      {POPULARITY_RAMP.map((c, p) => (
        <line
          key={c}
          x1={p * 11.5 + 1}
          x2={p * 11.5 + 9}
          y1="4"
          y2="4"
          stroke={c}
          strokeWidth={1.6 + 0.6 * p}
          strokeLinecap={p === 0 ? "round" : "butt"}
          strokeDasharray={p === 0 ? "0.1 3" : p === 1 ? "3 2" : undefined}
        />
      ))}
    </svg>
  );
}

/**
 * No start yet and the start card scrolled away (Peter, 2026-10-28: D1): a slim bar above the search,
 * "Vyrážate z: nevybraté · Vybrať štart", back to the card with its search box ready.
 */
function StartReminder() {
  const t = useT();
  const [away, setAway] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = document.querySelector("[data-start-chip]");
    if (!card) return;
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(card);
    return () => io.disconnect();
  }, []);
  // Phone: once the start card scrolls away, the reminder sits straight at the top of the screen
  // (under the top bar) instead of popping up above the trip search (Peter, 2026-11-02). Things
  // stuck to the top (the search row, a picked trip) move down under it by --startbar.
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const el = barRef.current;
    if (!away || !el) {
      root.setProperty("--startbar", "0px");
      dockMoved();
      return;
    }
    const phone = window.matchMedia("(max-width: 1023.98px)");
    const apply = () => {
      root.setProperty("--startbar", phone.matches ? `${el.offsetHeight}px` : "0px");
      dockMoved();
    };
    apply();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    phone.addEventListener("change", apply);
    return () => {
      ro?.disconnect();
      phone.removeEventListener("change", apply);
      root.setProperty("--startbar", "0px");
      dockMoved();
    };
  }, [away]);
  // Appearing, the card pops a little as it slides down.
  useEffect(() => {
    if (away) pop(barRef.current?.firstElementChild);
  }, [away]);
  // Always there (off screen above) so it slides in and moves with the top bar by transform
  // instead of popping up and jumping (Peter, 2026-11-03: "laggy/glitchy").
  return (
    <div
      ref={barRef}
      aria-hidden={!away}
      inert={!away}
      style={{ transform: away ? "translateY(var(--topbar, 0px))" : "translateY(-110%)", opacity: away ? 1 : 0, transitionTimingFunction: "var(--dock-ease, ease)" }}
      className="pointer-events-none fixed inset-x-0 top-0 z-30 px-3 pt-2 pb-1 transition-[transform,opacity] duration-[280ms] will-change-transform motion-reduce:transition-none lg:hidden"
    >
      <div className="pointer-events-auto mx-auto flex max-w-[640px] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2 shadow-[var(--shadow-float)] md:max-w-[760px]">
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[11.5px] text-[var(--muted)]">{t("Vyrážate z")}</span>
          <strong className="block truncate text-sm text-[var(--accent)]">{t("nevybraté")}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            const card = document.querySelector("[data-start-chip]");
            card?.scrollIntoView({ block: "start", behavior: "smooth" });
            // Ready to type once it is back in view.
            setTimeout(() => (document.querySelector("[data-start-search]") as HTMLInputElement | null)?.focus({ preventScroll: true }), 450);
          }}
          className="h-9 shrink-0 rounded-lg bg-[var(--accent)] px-3.5 text-sm font-bold text-[var(--accent-contrast)]"
        >
          {t("Vybrať štart")}
        </button>
      </div>
    </div>
  );
}

/**
 * Phones (globals.css .sky-edge; the home-screen app and Safari alike): iOS paints the strip behind the clock
 * itself, in a colour it takes from what touches the top of the page, and fades it into the
 * page. With nothing there it took the grey page colour and laid a haze over the sky (Peter,
 * 2026-11-04; the page starts below the clock there, safe-area-inset-top is 0). A thin fixed
 * band in the sky's own top colour gives it the right colour; gone once you scroll.
 */
function SkyEdge({ colour }: { colour: string }) {
  const [top, setTop] = useState(true);
  useEffect(() => {
    // Same "top" as the phone top bar (8 px), so the band is back the moment the bar turns see-through.
    const on = () => setTop(window.scrollY <= 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // Scrolled away it turns the page colour instead of hiding: iOS keeps the last colour it read
  // while scrolling, and with nothing at the top the strip stayed sky blue over the rest of the
  // page (Peter, 2026-11-05). iOS reads it during the scroll, so the change reaches the strip.
  const c = top ? colour : "var(--background)";
  // At the top it lies over the (see-through) phone top bar, so iOS finds the sky there and not the
  // bar; scrolled, under it, so the white bar coming in on the way up shows (Peter, 2026-11-05).
  return <div aria-hidden="true" className="sky-edge" style={{ background: `linear-gradient(${c}, ${c} 25%, transparent)`, zIndex: top ? 41 : undefined }} />;
}
