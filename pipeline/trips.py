"""Turn OSM data into trips: destination x trailhead pairs, walked there and back."""

import math
import re
from dataclasses import dataclass, field

import numpy as np
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

from . import names
from . import osm as osm_mod
from .geo import LocalProjection, ascent_descent, din33466_minutes, haversine, rdp_indices, resample, round_up_15, slugify

COLOUR_ORDER = ["red", "blue", "green", "yellow", "black"]
COLOUR_SK = {"red": "červenej", "blue": "modrej", "green": "zelenej", "yellow": "žltej", "black": "čiernej"}
KIND_BONUS = {"hrad": 30, "pleso": 30, "vodopad": 25, "jaskyna": 25, "roklina": 28, "chata": 20, "vyhliadka": 18, "vrchol": 12, "ine": 15}
GENERIC_NAMES = {"jazero", "vyhliadka", "výhľad", "rozhľadňa", "altánok", "vyhliadkové miesto", "chata", "hrad", "pleso"}
ROUTE_LIMIT = 18000  # weighted metres one way, generous; time limits are applied afterwards
PENDING = "__pending__"  # slug of a route until it is known whether it is the main one
TOWN_STREETS = {"residential", "living_street", "pedestrian"}  # their density marks a built-up area
TOWN_GOALS = {"hrad", "vrchol", "jaskyna", "vodopad"}  # worth a walk even when in a built-up area (a castle above a town)
CITY_CORE_M = 2500  # around the centre of a big city (Bratislava, Košice) every goal is a city sight, not a trip
CITY_CORE_POP = 200_000
FAMOUS = 6  # Wikipedia languages with an article: a place known well beyond its valley
DISTINCT_GOALS = {"vodopad", "pleso", "jaskyna", "hrad", "roklina"}  # two of these near each other are two goals
GORGE_VALLEY_FAME = 3
GORGE_TOP_MAX_ELE = 1300  # m; a valley reaching higher is a mountain valley  # a plain "dolina" counts as a gorge when this many Wikipedias have it
SHORT_LABEL = "Krátko od auta"  # a car park by the goal: look round the castle, no hike
SHORT_KINDS = {"hrad", "jaskyna", "vodopad", "vyhliadka", "pleso", "ine"}
DETOUR_KINDS = {"vyhliadka", "hrad", "chata", "obcerstvenie"}  # worth a side trip; springs and playgrounds are not
VIEW_KINDS = {"vyhliadka", "hrad"}
DETOUR_SNAP_M = 300  # a side-trip sight this far from any way still counts, walked cross-country
OFF_PATH = 1.5  # cross-country metres count this much more than a path
VERY_FAMOUS = 12  # every Tatra peak has a few (Polish, German); this many is a household name
SHORT_MAIN_KINDS = {"hrad", "jaskyna"}  # a show cave or castle: people drive to it, so the car-park visit can be the main route
# A car park whose OSM name says nothing ("Parkovisko", "TANAP parking", "P") names no start: it is treated as unnamed.
GENERIC_PARKING = re.compile(
    r"^\s*(?:(?:tanap|platené|bezplatné|verejné|hlavné|veľké|malé|horné|dolné)\s+)?(?:parkovisko|parking|p)"
    r"(?:\s+(?:tanap|zadarmo|pre návštevníkov))?\s*$", re.I)
# A short visit's car park, by what you came to see (Peter, 7 Nov 2026: name the car park, not a bare "Parkovisko").
KIND_PARKING = {"hrad": "Parkovisko pod hradom", "jaskyna": "Parkovisko pri jaskyni", "vodopad": "Parkovisko pri vodopáde",
                "pleso": "Parkovisko pri plese", "vyhliadka": "Parkovisko pod vyhliadkou"}


def is_generic_parking(name):
    """True for no name or a name that only says "car park" ("Parkovisko", "TANAP parking")."""
    return not (name or "").strip() or bool(GENERIC_PARKING.match(name))
# A guidepost named for a junction or a walking time ("Odbočka na Urpín, vyhliadku", "Rázcestie Šindľovec",
# "Hradište pod Vrátnom, rázc.", "Suchý vrch, odb. na vyhliadku", "Vyhliadka 8 min.", "Dva stromy 35'") says where
# a path forks, not where people start: such a start is labelled by what is round it (start_label).
JUNCTION_NAME = re.compile(r"\b(rázcestie|rázc\b\.?|odbočka|odb\.)|\d+\s?min\.?\s*$|\d+['\u2019\u2032]\s*$", re.I)


@dataclass
class Start:
    name: str
    lat: float
    lon: float
    ele: float | None
    osm: str | None
    node: int
    parking: list = field(default_factory=list)  # (walk_m, Feature)
    stops: list = field(default_factory=list)
    guidepost: str | None = None  # the guidepost's own name, when `name` is a label made from what is round it


def is_junction_name(name):
    return not name or not name.strip() or bool(JUNCTION_NAME.search(name))


def start_label(parking, stops, places, parking_m=250, stop_m=150, place_m=800, fallback_m=12000):
    """A start's name when its guidepost is only a junction: the nearest of a named car park, a bus or
    rail stop within `stop_m`, or a place (village, town) within `place_m`. Each list holds
    (distance_m, Feature), nearest first. A last resort names the nearest place at any distance up
    to `fallback_m` (12 km) ("Tokaríny, okolie"), else a plain "Turistický chodník"."""
    found = []
    for d, f in parking:
        nm = (f.name or "").strip()
        if d <= parking_m and re.search(r"[^\W\d_]{3,}", nm) and not is_junction_name(nm) and not is_generic_parking(nm):
            found.append((d, nm if "park" in names.fold(nm) else f"{nm}, parkovisko"))
    for d, f in stops:
        nm = (f.name or "").strip()
        if d <= stop_m and nm and not is_junction_name(nm):
            rail = f.tags.get("_mode") == "vlak" and not re.search(r"stani|zel|zast", names.fold(nm))
            found.append((d, f"{nm}, stanica" if rail else nm))
    places = [(d, f) for d, f in places if f.name and not is_junction_name(f.name)]
    for d, f in places:
        if d <= place_m:
            found.append((d, f.name))
    if found:
        return min(found, key=lambda x: x[0])[1]
    near = next(((d, f) for d, f in places if d <= fallback_m), None)
    return f"{near[1].name}, okolie" if near else "Turistický chodník"


@dataclass
class Candidate:
    kind: str
    feature: object
    region: dict
    node: int
    score: float
    limits: dict | None = None  # per-place limits from the config `include:` list
    included: bool = False  # hand-picked in `include:`: skips the fame and valley checks


class TripBuilder:
    def __init__(self, cfg, osm, graph, dem, closures, fees, slugs, sitelinks=None, log=print, car_ok=None):
        self.cfg = cfg
        self.t = cfg["trips"]
        self.osm = osm
        self.g = graph
        self.dem = dem
        self.closures = closures
        self.fees = fees
        self.slugs = slugs  # key -> slug, updated in place
        self.sitelinks = sitelinks or {}
        self.log = log
        self.car_ok = car_ok  # parking -> bool, True when a car can reach it (OSRM); None = no check
        self.proj = LocalProjection()
        # Hand-picked trips keep their own slugs; no generated trip may take one.
        self.used_slugs = {p["slug"] for p in cfg.get("pinned", [])}
        self.report = dict(rejected={}, regression=[], regions={}, watch={})
        # Well-known places (config `watch`): the report says what became of each one.
        self.watch = {names.fold(n): n for n in cfg.get("watch", [])}
        self.report["watch_names"] = list(cfg.get("watch", []))
        # Places whose main route is a named start (config `main_start:`): destination osm id -> start guidepost osm id.
        self.main_start = {e["dest"]: e["start"] for e in cfg.get("main_start") or []}
        self._village_names = None
        self._current = None  # name of the destination being built, for _reject

        def tree(feats):
            if not feats:
                return None
            return cKDTree(self.proj.xy([f.lat for f in feats], [f.lon for f in feats]))

        self.parking_tree = tree(osm.parking)
        self.stop_tree = tree(osm.stops)
        self.poi_feats = [f for _, f in osm.pois]
        self.poi_kinds = [k for k, _ in osm.pois]
        self.poi_tree = tree(self.poi_feats)
        self.place_tree = tree(getattr(osm, "places", []))
        self.town_cells = self._town_cells()
        # marked routes through each graph node: a start where several trails meet is a known one
        self.node_routes = {}
        for w in graph.ways:
            if w.routes:
                for i in np.searchsorted(graph.node_ids, w.nodes):
                    self.node_routes.setdefault(int(i), set()).update(w.routes)

    # ----------------------------------------------------------- helpers --
    def _town_cells(self):
        """Grid cells dense with town streets: a built-up area, where a walk is a city walk."""
        size = self.t.get("town_cell_m", 250)
        street = {}
        for w in self.g.ways:
            if w.highway not in TOWN_STREETS or len(w.lats) < 2:
                continue
            xy = self.proj.xy(w.lats, w.lons)
            seg = np.hypot(*np.diff(xy, axis=0).T)
            for c, L in zip(map(tuple, ((xy[:-1] + xy[1:]) / 2 // size).astype(int)), seg):
                street[c] = street.get(c, 0.0) + float(L)
        vals = np.array(list(street.values())) if street else np.zeros(1)
        self.log(f"town streets: {len(street)} cells, metres per cell p50/p90/p99/max "
                 f"{np.percentile(vals, [50, 90, 99]).round().tolist()} / {vals.max():.0f}; "
                 f">=800: {(vals >= 800).sum()}, >=1500: {(vals >= 1500).sum()}")
        return {c for c, L in street.items() if L >= self.t.get("town_street_m", 700)}

    def _in_town(self, lat, lon):
        """In a built-up area: its own square is, or most squares around it are (a bridge, a square)."""
        size = self.t.get("town_cell_m", 250)
        x, y = (self.proj.xy([lat], [lon])[0] // size).astype(int)
        around = sum((x + dx, y + dy) in self.town_cells for dx in (-1, 0, 1) for dy in (-1, 0, 1))
        return (x, y) in self.town_cells or around >= 4

    def _city_core(self, lat, lon):
        return any(
            f.tags.get("place") == "city" and _population(f.tags) >= CITY_CORE_POP
            and haversine(lat, lon, f.lat, f.lon) < CITY_CORE_M
            for f in self.osm.towns
        )

    def city_walk(self, path, dest, lim):
        """How much of a walk runs through a town, and whether that is too much: this site is
        for getting into nature, not touring a town. Returns (metres, verdict): "hard" when the
        walk runs long through a built-up area (never kept), "soft" when village or town
        streets are a big part of the way to a goal in nature (kept only when no start out of
        town is about as quick), else None. A goal in town (a castle above it) gets only the
        hard check."""
        if len(path) < 2:
            return 0.0, None
        g = self.g
        idx = g.edges(path)
        size = self.t.get("town_cell_m", 250)
        xy = self.proj.xy(g.lat[path], g.lon[path])
        cells = [tuple(c) for c in ((xy[:-1] + xy[1:]) / 2 // size).astype(int)]
        lens = g.edge_len[idx]
        dense = float(sum(L for c, L in zip(cells, lens) if c in self.town_cells))
        one_way = float(lens.sum())
        if dense > lim.get("town_walk_max_m", 1500) or (dense > 800 and dense > 0.5 * one_way):
            return dense, "hard"
        streets = float(sum(L for c, L, w in zip(cells, lens, g.edge_way[idx])
                            if c in self.town_cells or g.ways[w].highway in TOWN_STREETS))
        if self._in_town(dest["lat"], dest["lon"]):
            return streets, None
        if streets > lim.get("town_walk_free_m", 1000) and streets > lim.get("town_walk_share", 0.35) * one_way:
            return streets, "soft"
        return streets, None

    def in_country(self, lat, lon):
        if self.osm.border is None:
            return True
        from shapely.geometry import Point

        return self.osm.border.contains(Point(lon, lat))

    def region_of(self, lat, lon):
        for r in self.cfg["regions"]:
            if any(w <= lon <= e and s <= lat <= n for w, s, e, n in r["bboxes"]):
                return r
        return None

    def _near(self, tree, feats, lat, lon, radius):
        if tree is None:
            return []
        p = self.proj.xy([lat], [lon])[0]
        idx = tree.query_ball_point(p, radius)
        out = [(float(haversine(lat, lon, feats[i].lat, feats[i].lon)), feats[i]) for i in idx]
        return sorted(out, key=lambda x: x[0])

    def make_start(self, name, lat, lon, ele, osm_ref, node):
        st = Start(name, lat, lon, ele, osm_ref, node)
        st.parking = self._near(self.parking_tree, self.osm.parking, lat, lon, self.t["parking_max_m"])
        if self.car_ok:
            st.parking = [(d, f) for d, f in st.parking if self.car_ok(f)]
        stops = self._near(self.stop_tree, self.osm.stops, lat, lon, self.t["train_max_m"])
        st.stops = [
            (d, f) for d, f in stops
            if d <= (self.t["train_max_m"] if f.tags["_mode"] == "vlak" else self.t["bus_stop_max_m"])
        ]
        return st

    def start_label(self, st):
        """Name for a start whose guidepost is a junction label (see start_label())."""
        t = self.t
        places = self._near(self.place_tree, getattr(self.osm, "places", []), st.lat, st.lon, 12000)
        return start_label(st.parking, st.stops, places, t.get("start_label_parking_m", 250),
                           t.get("start_label_stop_m", 150), t.get("start_label_place_m", 800))

    # -------------------------------------------------------- trailheads --
    def trailheads(self):
        out = {}
        skip = set(self.t.get("exclude_starts", []))
        for f in self.osm.guideposts:
            if f.name in skip or (f.name and re.fullmatch(r"[\d\s,.]+m?(\s*n\.\s*m\.)?", f.name)):
                continue  # excluded, or named only by its elevation ("829 m")
            if not f.name or not self.in_country(f.lat, f.lon):
                continue
            node = self.g.snap(f.lat, f.lon, 60)
            if node is None or node in out:
                continue
            st = self.make_start(f.name, f.lat, f.lon, _num(f.tags.get("ele")), f.osm, node)
            if is_junction_name(f.name):
                st.guidepost = f.name
                st.name = self.start_label(st)
                self.report.setdefault("start_labels", {})[f.osm] = (f.name, st.name)
            near_stop = any(d <= self.t["trailhead_needs_stop_max_m"] for d, _ in st.stops)
            if st.parking or near_stop:
                out[node] = st
        self.log(f"trailheads with parking or a stop: {len(out)}")
        return out

    # ------------------------------------------------------ destinations --
    def candidates(self):
        out = []
        goals = {f.osm: (kind, f) for kind, f in self.osm.destinations}
        hand = {}  # osm ref -> its entry in the config `include:` list
        for e in self.cfg.get("include") or []:
            f = getattr(self.osm, "included", {}).get(e["osm"])
            if f is None:
                self.log(f"include: {e['osm']} not found in the OSM data (outside the regions, or deleted)")
                self.report.setdefault("include_missing", []).append(e["osm"])
                continue
            goals[f.osm] = (e["kind"], f)
            hand[f.osm] = e
        for kind, f in goals.values():
            self._note(f.name, f"found in OSM as {kind} ({f.osm}, Wikipedia in {self.fame(f)} languages)")
            if f.name.strip().lower() in GENERIC_NAMES or names.is_junk(f.name):
                continue
            if names.is_foreign(f.name, f.tags):
                self.report.setdefault("foreign", []).append(f.name)
                continue
            region = self.region_of(f.lat, f.lon)
            if region is None or not self.in_country(f.lat, f.lon):
                self._note(f.name, "outside Slovakia or every region")
                continue
            e = hand.get(f.osm)
            top = self._gorge_top(f) if f.tags.get("_ends") else None
            if e is None and kind == "roklina" and not osm_mod.GORGE_WORDS.search(f.name) and (
                    (top or 0) > GORGE_TOP_MAX_ELE
                    or self.fame(f) < (GORGE_VALLEY_FAME if "dolin" in f.name.lower() else 2)):
                # a high-mountain valley is a glacial one (Velická dolina, Meďodoly), not a gorge; lower down
                # only the known gorge-like ones (Suchá Belá, Sokolia dolina, Prosiecka dolina)
                self._note(f.name, "left out: a valley, not a known gorge")
                continue
            if e is None and kind == "ine" and self.fame(f) < 2:
                self._note(f.name, "left out: a sight not known enough")
                continue
            # A castle, waterfall or lake is a sight you see from the trail; a peak you stand on.
            snap_m = self.t["destination_snap_m"] if kind in ("vrchol", "vyhliadka") else self.t.get("sight_snap_m", 350)
            node = self.g.snap(f.lat, f.lon, snap_m, marked_only=True)
            if node is None:
                self._note(f.name, f"no marked trail within {snap_m} m")
                continue
            out.append(Candidate(kind, f, region, node, self.score(kind, f), (e or {}).get("limits"), e is not None))
        out.sort(key=lambda c: -c.score)
        self._famous_first(out)
        self.log(f"destination candidates near marked trails: {len(out)}")
        return out

    def _gorge_top(self, f):
        """A gorge is walked up: its goal is the upper end, where the ladders and falls are behind you.
        Returns the height of its upper end (None without elevation data)."""
        ends = list(f.tags["_ends"])
        top = None
        if self.dem:
            ele = self.dem.sample(np.array([e[0] for e in ends]), np.array([e[1] for e in ends]))
            if np.isfinite(ele).all():
                ends = [ends[i] for i in np.argsort(-ele)]
                top = float(ele.max())
        for lat, lon in ends:
            if self.g.snap(lat, lon, self.t.get("sight_snap_m", 350), marked_only=True) is not None:
                f.lat, f.lon = lat, lon
                break
        return top

    def fame(self, f):
        """How widely known a place is: Wikipedia languages that have an article on it."""
        return self.sitelinks.get(f.tags.get("wikidata"), 0) + (1 if f.tags.get("wikipedia") else 0)

    def _famous_first(self, cands):
        """Among places close together (a hut at a tarn, peaks on one ridge), the one people know
        is built first, so it is the one that stays: Téryho chata, not Malé Spišské pleso."""
        r = self.t.get("same_walk_m", 1500)
        order = sorted(range(len(cands)), key=lambda i: (-self.fame(cands[i].feature), -cands[i].score))
        for i in order:
            a = cands[i]
            fa = self.fame(a.feature)
            if fa < FAMOUS:
                break
            for b in cands:
                if (b is not a and b.score >= a.score and fa > 2 * self.fame(b.feature)
                        and haversine(a.feature.lat, a.feature.lon, b.feature.lat, b.feature.lon) < r):
                    a.score = b.score + 0.01
        # Parts of one gorge (Dolné Diery, Horné Diery): the one with the article, or else the one mapped as
        # the attraction, is the goal (Jánošíkove diery).
        def _known(c):
            return self.fame(c.feature), c.feature.tags.get("tourism") == "attraction"

        for a in cands:
            if a.kind != "roklina":
                continue
            for b in cands:
                if (b is not a and b.kind == "roklina" and b.score >= a.score and _known(a) > _known(b)
                        and haversine(a.feature.lat, a.feature.lon, b.feature.lat, b.feature.lon) < r):
                    a.score = b.score + 0.01
        # A hut by a tarn is the goal people name (Téryho chata, Zbojnícka chata), unless the hut
        # is named after the tarn (Chata pri Zelenom plese) or the tarn is better known (Skalnaté pleso).
        for a in cands:
            if a.kind != "chata" or "ples" in a.feature.name.lower():
                continue
            for b in cands:
                if (b.kind == "pleso" and b.score >= a.score and self.fame(a.feature) >= self.fame(b.feature)
                        and haversine(a.feature.lat, a.feature.lon, b.feature.lat, b.feature.lon) < self.t["dedupe_m"]):
                    a.score = b.score + 0.01
        cands.sort(key=lambda c: -c.score)

    def unused_famous(self, limit=250):
        """Well-known named places by a marked trail that no goal kind covers: what to add next."""
        out = []
        for f in getattr(self.osm, "others", []):
            if not self.region_of(f.lat, f.lon) or not self.in_country(f.lat, f.lon):
                continue
            if self.g.snap(f.lat, f.lon, 300, marked_only=True) is None:
                continue
            out.append((self.fame(f), f.name, osm_mod.main_tag(f.tags), self.region_of(f.lat, f.lon)["id"], f.osm))
        out.sort(key=lambda x: (-x[0], x[1]))
        return out[:limit]

    def _note(self, name, text):
        key = names.fold(name)
        if key in self.watch:
            self.report["watch"].setdefault(self.watch[key], []).append(text)

    def score(self, kind, f):
        t = f.tags
        s = KIND_BONUS.get(kind, 0)
        if t.get("wikipedia"):
            s += 15
        if t.get("wikidata"):
            s += 5
            s += min(30, 3 * self.sitelinks.get(t["wikidata"], 0))
        ele = _num(t.get("ele"))
        if kind == "vrchol" and ele:
            s += min(20, ele / 125)
        if "rozhľadň" in f.name.lower() or t.get("tower:type") == "observation":
            s += 10
        return s

    # ------------------------------------------------------------ build --
    def build(self):
        ths = self.trailheads()
        th_nodes = np.array(sorted(ths), dtype=np.int64)
        trips = []
        variants = []  # other routes to a trip's destination; not on the home list
        taken = []  # (region id, lat, lon, name, kind)

        for p in self.cfg.get("pinned", []):
            trip = self.build_pinned(p, ths, th_nodes)
            if trip:
                others = trip.pop("_others")
                trips.append(trip)
                variants += self._finish_variants(trip, others)
                taken.append((trip["region"], trip["destination"]["location"]["lat"], trip["destination"]["location"]["lon"], trip["name"],
                              trip["destination"]["kind"]))

        by_region = {}
        for c in self.candidates():
            by_region.setdefault(c.region["id"], []).append(c)

        for region in self.cfg["regions"]:
            rid = region["id"]
            # Plain sights (a famous rock, Kláštorisko) come last: never instead of a peak, waterfall or
            # viewpoint at the same spot (Veža nad Skokom must not take Vodopád Skok's place).
            cands = sorted(by_region.get(rid, []), key=lambda c: c.kind == "ine")
            chosen = []
            fam_needed = self.t["min_family_per_region"]
            # No cap means every destination that makes a good trip (the full import).
            cap = region.get("max_trips") or float("inf")
            for c in cands:
                n_regular = len([x for x in chosen if not x.get("_extra")])
                n_family = len([x for x in chosen if x["family_friendly"]])
                if n_regular >= cap and n_family >= fam_needed:
                    break
                # One place, two goals: a hut at a tarn, a viewpoint on a peak. A waterfall below a
                # tarn is a place of its own (Vajanského vodopád).
                near = None if c.included else next((n for r, la, lo, n, k in taken
                             if r == rid and haversine(c.feature.lat, c.feature.lon, la, lo) < self.t["dedupe_m"]
                             and _same_goal(k, c.kind)), None)
                if near:
                    self._note(c.feature.name, f"left out: within {self.t['dedupe_m']} m of the trip to {near}")
                    continue
                self._current = c.feature.name
                trip = self.build_generated(c, ths, th_nodes)
                if not trip:
                    continue
                others = trip.pop("_others")
                same_start = [x for x in chosen if x["start"]["osm"] == trip["start"]["osm"]]
                if len(same_start) >= self.t["max_trips_per_start"] and self.fame(c.feature) < FAMOUS and not c.included:
                    self._reject("start already has enough trips")
                    continue
                # A peak with its own Wikipedia article is a goal of its own, even one ridge away (Ostrý Roháč).
                if not c.included and self.fame(c.feature) < VERY_FAMOUS and any(
                        _same_goal(x["destination"]["kind"], c.kind)
                        and abs(x["distance_m"] - trip["distance_m"]) < 0.1 * trip["distance_m"]
                        and haversine(x["destination"]["location"]["lat"], x["destination"]["location"]["lon"],
                                      c.feature.lat, c.feature.lon) < self.t.get("same_walk_m", 1500) for x in same_start):
                    self._reject("almost the same walk as another trip")
                    continue
                if n_regular >= cap:
                    if not trip["family_friendly"]:
                        continue
                    trip["_extra"] = True
                chosen.append(trip)
                variants += self._finish_variants(trip, others)
                taken.append((rid, c.feature.lat, c.feature.lon, c.feature.name, c.kind))
                self._note(c.feature.name, f"trip {trip['slug']}")
            self.report["regions"][rid] = dict(candidates=len(cands), trips=len(chosen))
            self.log(f"{rid}: {len(chosen)} trips from {len(cands)} candidates")
            trips += chosen

        for t in trips:
            t.pop("_extra", None)
        trips, self.report["names"] = names.tidy(trips, names.Places(getattr(self.osm, "places", [])))
        for a, s, b, k, m in self.report["names"]["merged"]:
            self._note(a, f"merged into {k} ({m} m away, same name)")
        mains = {t["slug"] for t in trips}
        variants = [v for v in variants if v["variant_of"] in mains]
        self.report["unused"] = self.unused_famous()
        self._rank(trips)
        primary_rank = {t["slug"]: t["rank"] for t in trips}
        by_slug = {t["slug"]: t for t in trips}
        # "Cez Pajštún": the route passes another place people go to (a goal of a known trip).
        # Plain huts and viewpoints along the way are often cottages or nameless spots, so not those.
        goals = {t["destination"]["osm"]: t["destination"]["name"] for t in trips
                 if t["destination"]["osm"] and t["rank"] >= 40}
        via, by_place = {}, {}
        for v in variants:
            v.pop("_score", None)
            main = by_slug[v["variant_of"]]
            v["rank"] = primary_rank[v["variant_of"]]
            if not v["curated"]:
                v["name"] = main["name"]
            on_main = {p["osm"] for p in main["pois"]}
            hit = next((goals[p["osm"]] for p in v["pois"] if p["osm"] in goals and p["osm"] not in on_main
                        and goals[p["osm"]] != v["destination"]["name"] and len(goals[p["osm"]]) <= 26), None)
            if hit and names.fold(hit) not in names.fold(v["start"]["name"]):  # not "Cez Devín" from Devín
                via[v["slug"]] = hit
            by_place.setdefault(v["variant_of"], []).append(v)
        for slug, routes in by_place.items():
            self.assign_labels(by_slug[slug], routes, via)
        start = lambda t: t["start"]["osm"] or t["start"]["name"]
        self.report["alternatives"] = sum(len(rs) + 1 - len({start(t) for t in rs + [by_slug[s]]}) for s, rs in by_place.items())
        self.report["variants"] = len(variants)
        self.report["detours"] = sum(self.add_detours(t) for t in trips + variants)
        return trips + variants

    def add_detours(self, trip):
        """Sights worth a short side trip: a viewpoint, castle, hut or food off the walk but within
        detour_max_min there and back. They join `pois` with `detour_min`; returns how many."""
        full = trip.pop("_full", None)
        lim = self.t.get("detour_max_min", 30)
        # A view or a castle is worth a steeper side trip than a buffet (Peter 2026-10-23).
        lims = {k: self.t.get("detour_view_max_min", lim) if k in VIEW_KINDS else lim for k in DETOUR_KINDS}
        lim = max(lims.values())
        if self.poi_tree is None or full is None or lim <= 0:
            return 0
        g = self.g
        on = {p["osm"] for p in trip["pois"]} | {trip["destination"]["osm"]}
        reach = lim / 60 * 4000 / 2  # metres one way at 4 km/h on the flat: the most a detour can be
        xy = g.proj.xy(g.lat[full], g.lon[full])
        hits = set()
        for lst in self.poi_tree.query_ball_point(xy, reach):
            hits.update(lst)
        cands = [i for i in sorted(hits)
                 if self.poi_kinds[i] in DETOUR_KINDS and self.poi_feats[i].osm not in on and self.poi_feats[i].name]
        if not cands:
            return 0
        dist, _, src = dijkstra(g.L, directed=True, indices=np.unique(np.asarray(full, np.int64)), limit=reach,
                                min_only=True, return_predecessors=True)
        path_tree = cKDTree(xy)
        found = []
        for i in cands:
            f, kind = self.poi_feats[i], self.poi_kinds[i]
            # Straight off the walk (a rock just off the path, a way the graph doesn't join up)...
            off, j = path_tree.query(self.proj.xy([f.lat], [f.lon])[0])
            best = (OFF_PATH * off, full[j]) if off <= DETOUR_SNAP_M else (np.inf, None)
            # ...or along the paths to the way nearest it, and the last bit cross-country.
            node = g.snap(f.lat, f.lon, DETOUR_SNAP_M)
            if node is not None and np.isfinite(dist[node]):
                d = dist[node] + OFF_PATH * haversine(f.lat, f.lon, g.lat[node], g.lon[node])
                if d < best[0]:
                    best = (d, src[node])
            d, start = best
            if not np.isfinite(d):
                continue
            climb = 0.0
            if self.dem:
                e = self.dem.sample(np.array([f.lat, g.lat[start]]), np.array([f.lon, g.lon[start]]))
                climb = abs(float(e[0] - e[1])) if np.isfinite(e).all() else 0.0
            minutes = din33466_minutes(2 * d, climb, climb)
            if minutes <= lims[kind]:
                found.append((minutes, dict(kind=kind, name=f.name, location=_loc(f.lat, f.lon), osm=f.osm,
                                            detour_min=max(5, int(round(minutes / 5)) * 5), **_food(kind, f))))
        found.sort(key=lambda x: x[0])
        trip["pois"] = trip["pois"] + [p for _, p in found[: self.t.get("detour_max", 6)]]
        return len(found[: self.t.get("detour_max", 6)])

    def _reject(self, why):
        self.report["rejected"][why] = self.report["rejected"].get(why, 0) + 1
        if self._current:
            self._note(self._current, f"left out: {why}")
        return None

    def build_generated(self, c, ths, th_nodes):
        """The main route to a destination, with the other routes to it under `_others`."""
        dest = dict(name=c.feature.name, kind=c.kind, lat=c.feature.lat, lon=c.feature.lon,
                    ele=_num(c.feature.tags.get("ele")), osm=c.feature.osm, tags=c.feature.tags)
        if self._city_core(dest["lat"], dest["lon"]):
            # UFO, the castle, Slavín: you take the tram there, not a hiking trip.
            self.report.setdefault("town", []).append((dest["name"], c.kind, "city centre", "", 0))
            return self._reject("sight in a city centre")
        if c.kind not in TOWN_GOALS and self._in_town(dest["lat"], dest["lon"]):
            # A tower or viewpoint in a town is a sight you go straight to, not a trip (UFO).
            self.report.setdefault("town", []).append((dest["name"], c.kind, "in town", "", 0))
            return self._reject("sight in a town")
        routes, why = self.routes_to(c.node, dest, c.region, ths, th_nodes, limits=c.limits)
        if not routes:
            return self._reject(why)
        main = self._pick_main(routes, self.main_start.get(dest["osm"]))
        hike = main
        if c.kind in SHORT_MAIN_KINDS:
            # A castle or show cave people drive to: the visit from the car park by it is the main route,
            # the hike stays as another route (Gombasecká jaskyňa came with a 9 km walk from the next village).
            short = self.short_visit(main, routes, c.node, dest, c.region)
            if short:
                short["_known"] = main["_known"]
                routes = routes + [short]
                main = short
        st = main["start"]
        self._set_slug(main, self._slug(f"{dest['osm'] or dest['name']}|{st['osm'] or st['name']}", dest["name"],
                                        self._collision_tag(dest, c.region)))
        main["_score"] = c.score
        others = [r for r in routes if r is not main]
        main["_others"] = others + self._alternatives_for(hike, [r for r in others if r is not hike], c.node, dest,
                                                          c.region, routes, c.limits)
        return main

    def routes_to(self, target, dest, region, ths, th_nodes, known=(), limits=None):
        """Good routes to `target` from different trailheads, cheapest first.

        Routes that share more than route_overlap_max of their length count as one
        (two guideposts in one village, or the same trail joined a little lower).
        `known` holds edge sets of routes already built (a hand-picked trip); `limits` can
        lower min_round_trip_m and min_ascent_m for one place (a short stroll from a car park
        that everyone takes, like Kamzík)."""
        lim = {**self.t, **(limits or {})}
        dist, succ = self.g.costs_to(target, ROUTE_LIMIT)
        costs = dist[th_nodes]
        if not np.isfinite(costs).any():
            return [], "no trailhead within reach"
        seen = list(known)
        out, why, looked, town_walks = [], "trailheads too close", 0, []
        for i in np.argsort(costs):
            if not np.isfinite(costs[i]) or looked >= self.t.get("route_trailheads_max", 25):
                break
            st = ths[int(th_nodes[i])]
            if haversine(st.lat, st.lon, dest["lat"], dest["lon"]) < lim["min_round_trip_m"] / 4:
                continue
            looked += 1
            path = self.g.walk_to_target(succ, st.node, target)
            if path is None:
                why = "path broken"
                continue
            edges = self._edge_set(path)
            if any(self._overlap(edges, e) for e in seen):
                continue
            trip = self.make_trip(st, dest, path, region, curated=False, slug=PENDING)
            bad = self._quality(trip, dest["kind"], lim) if trip else "could not build"
            if not bad:
                town, verdict = self.city_walk(path, dest, lim)
                if verdict == "soft":
                    # Half the way through village streets: only if no start out of town is about as quick.
                    town_walks.append((trip, edges, st.name, round(town)))
                    continue
                if verdict:
                    # Nobody walks an hour through streets to reach a hill; from the edge of town, fine.
                    bad = "city walk"
                    self.report.setdefault("town", []).append((dest["name"], dest["kind"], "city walk", st.name, round(town)))
            if bad:
                why = bad
                continue
            trip["_known"] = self.known_score(st)
            trip["_edges"] = edges
            seen.append(edges)
            out.append(trip)
            if len(out) >= 2 * self.t.get("max_starts_per_destination", 3):
                break
        if town_walks:
            trip, edges, name, town = min(town_walks, key=lambda t: t[0]["duration_min"])
            quick = trip["duration_min"] + max(60, 0.5 * trip["duration_min"])
            # The start out of town must do the same job: by car, so with parking (the main route needs it).
            other = next((t for t in out if t["duration_min"] <= quick and t["parking"]), None)
            # A long way from far out that ends on the same path is no reason to drop it (Zobor from Nitra).
            longer = [t for t in out if self._overlap(edges, t["_edges"])]
            if not other and not any(self._overlap(edges, e) for e in known):
                out = [t for t in out if not any(t is x for x in longer)]
                trip["_known"] = self.known_score(trip["_st"])
                trip["_edges"] = edges
                out.append(trip)
                self.report.setdefault("town_kept", []).append((dest["name"], name, town))
            else:
                instead = f"{other['start']['name']} {other['duration_min']} min" if other else "a hand-picked route"
                for _, _, name, town in town_walks:
                    self.report.setdefault("town", []).append((dest["name"], instead, "streets, start out of town used", name, town))
        return out, why

    def _quality(self, trip, kind, lim):
        if trip["duration_min"] > lim["max_duration_min"]:
            return "too long"
        if trip["distance_m"] < lim["min_round_trip_m"]:
            return "too short"
        if trip["marked_share"] < lim["min_marked_share"]:
            return "mostly unmarked"
        if trip["ascent_m"] < lim["min_ascent_m"] and kind not in ("pleso", "vodopad", "jaskyna"):
            return "too flat (city walk)"
        return None

    def _edge_set(self, path):
        g = self.g
        e = g.edges(path) if len(path) > 1 else np.zeros(0, int)
        return {(min(a, b), max(a, b)): float(L) for a, b, L in zip(path[:-1], path[1:], g.edge_len[e])}

    def _overlap(self, a, b):
        la, lb = sum(a.values()), sum(b.values())
        if la <= 0 or lb <= 0:
            return True
        shared = sum(L for k, L in a.items() if k in b)
        return shared > self.t.get("route_overlap_max", 0.5) * min(la, lb)

    def known_score(self, st):
        """How well known a start is, from what OSM shows around it: a big car park, a stop,
        a place to eat, several marked trails meeting, a village. No per-route popularity
        data is free for commercial use, so these stand in for it."""
        s = 0.0
        cars = [_cars(f) for d, f in st.parking if d <= 400]
        if cars:
            c = max(cars)
            s += 25 if c >= 100 else 18 if c >= 40 else 10 if c >= 15 else 5
        if any(d <= 500 for d, _ in st.stops):
            s += 10
        kinds = {k for _, k in self._near_pois(st.lat, st.lon, 300)}
        s += 6 * len(kinds & {"obcerstvenie", "chata"})
        routes = set()
        for n in self._nodes_near(st.lat, st.lon, 60):
            routes |= self.node_routes.get(n, set())
        s += min(12, 4 * max(0, len(routes) - 1))
        if self.place_tree is not None and self._near(self.place_tree, self.osm.places, st.lat, st.lon, 800):
            s += 6
        return s

    def _near_pois(self, lat, lon, radius):
        if self.poi_tree is None:
            return []
        p = self.proj.xy([lat], [lon])[0]
        return [(self.poi_feats[i], self.poi_kinds[i]) for i in self.poi_tree.query_ball_point(p, radius)]

    def _nodes_near(self, lat, lon, radius):
        g = self.g
        if g.marked_tree is None:
            return []
        p = g.proj.xy([lat], [lon])[0]
        return [int(g.marked_nodes[i]) for i in g.marked_tree.query_ball_point(p, radius)]

    def _pick_main(self, routes, prefer_start=None):
        """The route most people would take: the best-known start, unless it is a lot longer.
        By car the main route needs parking, so a start with only a bus stop is never it
        when another route has parking. `prefer_start` (config `main_start:`, a guidepost's OSM id)
        names the start of the main route for one place, when the place has a route from it."""
        chosen = next((r for r in routes if prefer_start and r["start"]["osm"] == prefer_start), None)
        if chosen:
            return chosen
        with_parking = [r for r in routes if r["parking"]] or routes
        shortest = min(r["duration_min"] for r in with_parking)
        # A big car park at an aquapark must not send people on a walk two hours longer (Veľký Choč).
        ok = [r for r in with_parking if r["duration_min"] <= min(1.5 * shortest, shortest + 60)]
        return max(ok, key=lambda r: (r["_known"] - (r["duration_min"] - shortest) / 10, -r["duration_min"]))

    def _keep_starts(self, others):
        """The other starts a place keeps: a hand-picked route always, then the best-known."""
        starts = [r for r in others if "_alt_of" not in r and not r.get("_short")]
        starts = sorted(starts, key=lambda r: (not r["curated"], -r["_known"], r["duration_min"]))
        return starts[: self.t.get("max_starts_per_destination", 3) - 1]

    def _alternatives_for(self, main, others, target, dest, region, routes, limits=None):
        """Other ways up from the main start and from each other start the place keeps."""
        if not self.t.get("alt_routes_per_start", 1):
            return []
        lim = {**self.t, **(limits or {})}
        seen = [r.get("_edges") or self._edge_set(r["_path"]) for r in routes]
        alts = []
        for base in [main] + self._keep_starts(others):
            for a in self.alternatives(base, target, dest, region, seen, lim):
                seen.append(a["_edges"])
                alts.append(a)
        short = self.short_visit(main, routes, target, dest, region)
        return alts + ([short] if short else [])

    def short_visit(self, main, routes, target, dest, region):
        """Park by the castle and look round it: a few hundred metres from a car park at the goal.
        Never the main route and only where the main route is a real walk; an option for people
        who came for the place, not the hike."""
        if dest["kind"] not in SHORT_KINDS or main["duration_min"] < self.t.get("short_main_min", 60):
            return None
        if any(r["duration_min"] <= self.t.get("short_max_min", 45) for r in routes):
            return None  # a short route is there already
        g, max_m = self.g, self.t.get("short_walk_max_m", 800)
        for d, f in self._near(self.parking_tree, self.osm.parking, dest["lat"], dest["lon"], max_m):
            if self.car_ok and not self.car_ok(f):
                continue
            node = g.snap(f.lat, f.lon, 150)
            if node is None or node == target:
                continue
            dist, pred = g.costs_from(node, 4 * max_m)
            path = g.walk_from_source(pred, node, target) if np.isfinite(dist[target]) else None
            if path is None or len(path) < 2 or float(g.edge_len[g.edges(path)].sum()) > max_m:
                continue
            name = f.name
            if is_generic_parking(name):  # "Parkovisko pod hradom", not a bare "Parkovisko" (it is often a main route's start)
                near = self._near(self.place_tree, getattr(self.osm, "places", []), f.lat, f.lon, 3000)
                name = KIND_PARKING.get(dest["kind"]) or (f"{near[0][1].name}, parkovisko" if near else f"{dest['name']}, parkovisko")
            st = self.make_start(name, f.lat, f.lon, None, f.osm, node)
            trip = self.make_trip(st, dest, path, region, curated=False, slug=PENDING)
            if not trip or trip["duration_min"] > self.t.get("short_max_min", 45):
                continue
            trip["_known"] = 0
            trip["_short"] = True
            return trip
        return None

    def alternatives(self, base, target, dest, region, seen, lim):
        """Other ways from the same start: the shortest way to Devínska Kobyla skirts the hill, a
        longer one goes over the top. Found by making the walks already found dearer and routing
        again, like a map app's "other routes". A way counts when a good part of it is new and
        mostly on marked trails, and it is not much longer."""
        g, st = self.g, base["_st"]
        taken = [base["_path"]]
        union = dict(self._edge_set(base["_path"]))
        out = []
        tries = self.report.setdefault("alt_tries", [])

        def why(text, **kw):
            # The hand-picked trips show in the report why no other way was found (Devínska Kobyla).
            if base["curated"]:
                tries.append(dict(slug=base["slug"], start=st.name, why=text, **kw))

        for _ in range(self.t.get("alt_tries", 3)):
            if len(out) >= self.t.get("alt_routes_per_start", 1):
                break
            pos = np.unique(np.concatenate([g.data_pos(p) for p in taken]))
            old = g.G.data[pos].copy()
            g.G.data[pos] = old * self.t.get("alt_penalty", 4.0)
            try:
                dist, pred = g.costs_from(st.node, ROUTE_LIMIT * 2)
            finally:
                g.G.data[pos] = old
            if not np.isfinite(dist[target]):
                why("no other path")
                break
            path = g.walk_from_source(pred, st.node, target)
            if path is None:
                why("no other path")
                break
            taken.append(path)
            edges = self._edge_set(path)
            idx = g.edges(path)
            # A marked trail or a plain footpath (a ridge path, a nature trail); not a forest road.
            new = [(L, bool(g.ways[w].routes) or g.ways[w].highway in ("path", "footway", "steps"))
                   for a, b, L, w in zip(path[:-1], path[1:], g.edge_len[idx], g.edge_way[idx])
                   if (min(a, b), max(a, b)) not in union]
            union.update(edges)
            new_m = sum(L for L, _ in new)
            good_m = sum(L for L, ok in new if ok)
            if new_m < max(self.t.get("alt_new_min_m", 1000), self.t.get("alt_new_share", 0.35) * sum(edges.values())):
                why("same walk with a small detour", new_m=round(new_m))
                continue
            if good_m < self.t.get("alt_new_marked_share", 0.6) * new_m:
                why("new part mostly forest road", new_m=round(new_m), good_m=round(good_m))
                continue
            if any(self._overlap(edges, e) for e in seen if e is not None):
                why("another start's route", new_m=round(new_m))
                continue
            trip = self.make_trip(st, dest, path, region, curated=False, slug=PENDING)
            # Ridge paths and nature trails are often unmarked (Devínska Kobyla over the top), so the
            # other way may be less marked than a first route, as long as its new part is footpath.
            alt_lim = {**lim, "min_marked_share": self.t.get("alt_min_marked_share", 0.35)}
            bad = self._quality(trip, dest["kind"], alt_lim) if trip else "could not build"
            if bad:
                why(bad, new_m=round(new_m))
                continue
            if trip["duration_min"] > base["duration_min"] + max(60, 0.8 * base["duration_min"]):
                why("much longer", new_m=round(new_m), min=trip["duration_min"])
                continue
            town, verdict = self.city_walk(path, dest, lim)
            if verdict:
                why("city walk", new_m=round(new_m))
                continue
            why("kept", new_m=round(new_m), min=trip["duration_min"])
            trip["_known"] = base.get("_known", 0)
            trip["_edges"] = edges
            trip["_alt_of"] = base
            out.append(trip)
        return out

    def _finish_variants(self, main, others):
        """Slugs for the other routes a place keeps: up to max_starts_per_destination - 1 other
        starts, plus other ways from the main start and from those starts, at most
        max_routes_per_destination - 1 in all. Labels come later (assign_labels)."""
        starts = self._keep_starts(others)
        kept = {id(main)} | {id(r) for r in starts}
        alts = [r for r in others if "_alt_of" in r and id(r["_alt_of"]) in kept]
        short = [r for r in others if r.get("_short")]
        # The main start's other way first: most people start there. The car park by the goal
        # always stays, last.
        alts.sort(key=lambda r: r["_alt_of"] is not main)
        keep = (alts[:1] + starts + alts[1:])[: self.t.get("max_routes_per_destination", 5) - 1 - len(short)] + short
        out = []
        for r in keep:
            if r["slug"] == PENDING:
                self._set_slug(r, self._variant_slug(main, r))
            r["variant_of"] = main["slug"]
            r["route_label"] = SHORT_LABEL if r.get("_short") else "Iná cesta"
            r["region"], r["region_name"], r["protected_area"] = main["region"], main["region_name"], main["protected_area"]
            out.append(r)
        for r in [main] + others:
            for k in ("_known", "_edges", "_st", "_path", "_alt_of", "_short"):
                r.pop(k, None)
        if out:  # one route only: no route fields at all
            main["route_label"] = "Hlavná cesta"
            main["route_count"] = 1 + len(out)
        return out

    @staticmethod
    def assign_labels(main, routes, via):
        """One or two words on why someone would pick each route over the main one, each used once
        per place: of two shorter routes the shortest is "Kratšia", the other gets the next word
        that fits it. `via` maps a route's slug to a known place it passes ("Cez Pajštún")."""
        m = main
        key = lambda r: r["start"]["osm"] or r["start"]["name"]
        starts = [key(m)] + [key(r) for r in routes]
        # Another way from a start the place already has (the main one's or another route's).
        same_start = lambda r: starts.count(key(r)) > 1
        rules = [  # (label, fits, better), better = lower sort key
            ("Autobusom", lambda r: r["transit"] and not m["transit"], lambda r: r["duration_min"]),
            ("Kratšia", lambda r: r["duration_min"] <= m["duration_min"] - 30, lambda r: r["duration_min"]),
            ("Na celý deň", lambda r: r["duration_min"] >= 300 and r["duration_min"] >= m["duration_min"] + 60,
             lambda r: -r["duration_min"]),
            ("Dlhšia", lambda r: r["duration_min"] >= m["duration_min"] + 45, lambda r: -r["duration_min"]),
            ("Menej do kopca", lambda r: m["ascent_m"] and r["ascent_m"] <= 0.7 * m["ascent_m"], lambda r: r["ascent_m"]),
            ("Iným chodníkom", same_start, lambda r: r["duration_min"]),
            ("Okľukou", same_start, lambda r: r["duration_min"]),
        ]
        # The car park by the goal keeps its own word.
        label = {r["slug"]: SHORT_LABEL for r in routes if r.get("route_label") == SHORT_LABEL}
        used = {"Hlavná cesta", SHORT_LABEL}
        # A place it passes says the most; then the rules, each word to the route it fits best.
        for r in sorted(routes, key=lambda r: r["duration_min"]):
            v = via.get(r["slug"])
            if v and f"Cez {v}" not in used:
                label[r["slug"]] = f"Cez {v}"
                used.add(label[r["slug"]])
        for word, fits, better in rules:
            free = [r for r in routes if r["slug"] not in label and fits(r)]
            if free:
                label[min(free, key=better)["slug"]] = word
                used.add(word)
        for r in sorted(routes, key=lambda r: r["duration_min"]):
            if r["slug"] in label:
                continue
            # Then the side of the hill it comes up from (the start's name is on the row already).
            sides = [] if same_start(r) else _sides(r)
            word = next((w for w in sides if w not in used), None)
            n = 2
            while word is None or word in used:
                word, n = ("Iná cesta" if n == 2 else f"Iná cesta {n - 1}"), n + 1
            label[r["slug"]] = word
            used.add(word)
        for r in routes:
            r["route_label"] = label[r["slug"]]

    def _set_slug(self, trip, slug):
        trip["slug"] = slug
        trip["gpx_url"] = f"/gpx/{slug}.gpx"

    def _variant_slug(self, main, r):
        """Stable per destination and start: '<main slug>-<start>', another way from that start
        '<main slug>-<start>-ina-cesta'."""
        tag = "alt" if "_alt_of" in r else "short" if r.get("_short") else ""
        key = f"v|{main['destination']['osm'] or main['destination']['name']}|{r['start']['osm'] or r['start']['name']}"
        key += f"|{tag}" if tag else ""
        s = self.slugs.get(key)
        if not s or s in self.used_slugs:
            base = (f"{main['slug']}-od-auta" if tag == "short"
                    else f"{main['slug']}-{slugify(r['start']['name'], 24)}" + ("-ina-cesta" if tag else ""))
            s, n = base, 2
            taken = set(self.slugs.values()) | self.used_slugs
            while s in taken:
                s = f"{base}-{n}"
                n += 1
        self.slugs[key] = s
        self.used_slugs.add(s)
        return s

    def build_pinned(self, p, ths=None, th_nodes=None):
        s, d = p["start"], p["destination"]
        s_node = self.g.snap(s["lat"], s["lon"], 300)
        d_node = self.g.snap(d["lat"], d["lon"], 300)
        if s_node is None or d_node is None:
            self.report["regression"].append(dict(slug=p["slug"], error="start or destination not on the walking graph"))
            return None
        # Same preference for marked trails as every other trip: plain shortest paths cut through
        # unmarked forest tracks (Vysoká z Kuchyne ran half its length off the marked trails).
        dist, succ = self.g.costs_to(d_node, ROUTE_LIMIT * 2)
        out_path = self.g.walk_to_target(succ, s_node, d_node) if np.isfinite(dist[s_node]) else None
        if out_path is None:
            self.report["regression"].append(dict(slug=p["slug"], error="no path"))
            return None
        st = self.make_start(s["name"], s["lat"], s["lon"], None, None, s_node)
        region = self.region_of(d["lat"], d["lon"]) or self.cfg["regions"][-1]
        dest = dict(name=d["name"], kind=p.get("kind", "ine"), lat=d["lat"], lon=d["lon"], ele=None, osm=None, tags={})
        trip = self.make_trip(st, dest, out_path, region, curated=True, slug=p["slug"], name=p["name"],
                              description=p.get("description"))
        if trip is None:
            self.report["regression"].append(dict(slug=p["slug"], error="could not build"))
            return None
        exp = p.get("expect") or {}
        row = dict(slug=p["slug"])
        for k in ("distance_m", "ascent_m", "duration_min"):
            if exp.get(k):
                row[k] = (trip[k], exp[k], (trip[k] - exp[k]) / exp[k])
        self.report["regression"].append(row)
        trip["_known"] = self.known_score(st)
        others = []
        if ths is not None and len(th_nodes):
            others, _ = self.routes_to(d_node, dest, region, ths, th_nodes, known=[self._edge_set(out_path)],
                                       limits=p.get("route_limits"))
        main = trip
        if p.get("main") == "auto" and others:
            main = self._pick_main([trip] + others)
            if main is not trip:
                # The page keeps its address (people saved and shared it); the hand-picked route moves.
                self._set_slug(main, p["slug"])
                self._set_slug(trip, PENDING)
                # Not hand-picked itself: the hand-picked route stays curated (the regression set).
                main["name"] = d["name"]
        main["_score"] = 60
        rest = [r for r in [trip] + others if r is not main]
        main["_others"] = rest + self._alternatives_for(main, rest, d_node, dest, region, [trip] + others,
                                                        p.get("route_limits"))
        return main

    # ------------------------------------------------------- trip record --
    def make_trip(self, st, dest, out_path, region, curated, slug=None, name=None, description=None):
        g = self.g
        back_path = None
        if g.has_oneway(out_path):
            dist, pred = g.costs_from(out_path[-1], ROUTE_LIMIT * 2)
            back_path = g.walk_from_source(pred, out_path[-1], out_path[0]) if np.isfinite(dist[out_path[0]]) else None
            if back_path is None:
                return self._reject("one-way path without a way back")
        full = out_path + (back_path[1:] if back_path else [])
        turn = len(out_path) - 1

        lat, lon = g.lat[full], g.lon[full]
        e_idx = g.edges(full) if len(full) > 1 else np.zeros(0, int)
        e_len = g.edge_len[e_idx]
        e_way = [g.ways[w] for w in g.edge_way[e_idx]]
        e_colour = [self._colour(w) for w in e_way]
        total = float(e_len.sum())
        marked_len = float(sum(L for L, w in zip(e_len, e_way) if w.routes))
        out_len = float(e_len[:turn].sum())
        walk_len = total if back_path else 2 * out_len
        if walk_len <= 0:
            return self._reject("empty path")

        # elevation
        rl, ro, rt = resample(lat, lon, 20.0)
        ele = self.dem.sample(rl, ro) if self.dem else np.full(len(rl), np.nan)
        have_dem = np.isfinite(ele).mean() > 0.9
        if have_dem:
            ele = _smooth(_fill(ele), 5)
            turn_t = float(np.cumsum(np.concatenate([[0], e_len]))[turn])
            k = int(np.searchsorted(rt, turn_t))
            up1, down1 = ascent_descent(ele[: k + 1].tolist(), 5.0)
            if back_path:
                up2, down2 = ascent_descent(ele[k:].tolist(), 5.0)
            else:
                up2, down2 = down1, up1
            max_ele = float(np.nanmax(ele))
        else:
            e0 = st.ele
            e1 = dest["ele"]
            climb = max(0.0, (e1 or 0) - (e0 or e1 or 0))
            up1, down1, up2, down2 = climb, 0.0, 0.0, climb
            max_ele = e1
        up, down = up1 + up2, down1 + down2
        duration = round_up_15(din33466_minutes(walk_len, up, down))
        max_sac = max((w.sac for w in e_way), default=0)
        difficulty = (
            "tazka" if duration >= 360 or up >= 1000 or max_sac >= 4
            else "lahka" if duration <= 180 and up <= 400 and max_sac <= 2
            else "stredna"
        )
        family = difficulty == "lahka" and duration <= 150 and max_sac <= 2

        # marking colours by length
        col_len = {}
        for L, c in zip(e_len, e_colour):
            if c:
                col_len[c] = col_len.get(c, 0) + L
        marking = sorted(col_len, key=lambda c: -col_len[c])

        # rules
        refs = {g.routes[i]["ref"] for w in e_way for i in w.routes if g.routes[i]["ref"]}
        tags = set().union(*(w.tags for w in e_way)) if e_way else set()
        closure_ids = self.closures.match(rl, ro, refs, tags, (dest["lat"], dest["lon"]), dest.get("name"))
        fee_rule_ids = self.fees.match(rl, ro, refs, tags)
        fees = self._fees(dest, fee_rule_ids)

        # path for the JSON: simplified, with elevation and colour runs
        xy = self.proj.xy(lat, lon)
        keep = rdp_indices(xy, 5.0)
        path_pts = keep if back_path else [i for i in keep if i <= turn]
        if turn not in path_pts:
            path_pts = sorted(set(path_pts) | {turn})
        pe = self.dem.sample(lat[path_pts], lon[path_pts]) if (self.dem and have_dem) else np.full(len(path_pts), np.nan)
        path = [[round(float(lon[i]), 6), round(float(lat[i]), 6), None if not np.isfinite(e) else int(round(e))]
                for i, e in zip(path_pts, pe)]
        runs = []
        for j in range(len(path_pts) - 1):
            c = e_colour[path_pts[j]]
            if runs and runs[-1]["colour"] == c:
                runs[-1]["to"] = j + 1
            else:
                runs.append(dict(**{"from": j, "to": j + 1}, colour=c))

        # POIs along the walk
        pois = []
        if self.poi_tree is not None:
            pxy = self.proj.xy(rl, ro)
            hits = set()
            for lst in self.poi_tree.query_ball_point(pxy, self.t["poi_max_m"]):
                hits.update(lst)
            for i in sorted(hits):
                f = self.poi_feats[i]
                if f.osm == dest["osm"]:
                    continue
                pois.append(dict(kind=self.poi_kinds[i], name=f.name, location=_loc(f.lat, f.lon), osm=f.osm,
                                 **_food(self.poi_kinds[i], f)))
            pois = pois[:20]

        parking = [_parking(d, f) for d, f in st.parking[:4]]
        stops = [_stop(d, f) for d, f in st.stops]
        stops = stops[:3] + [s for s in stops[3:] if s["mode"] == "vlak"][:1]

        key = f"{dest['osm'] or dest['name']}|{st.osm or st.name}"
        slug = slug or self._slug(key, dest["name"], slugify(st.name, 24))
        name = name or dest["name"]
        lats_all, lons_all = np.asarray(lat), np.asarray(lon)
        trip = dict(
            slug=slug,
            name=name,
            description=description or self._describe(dest, st, marking, bool(back_path)),
            region=region["id"],
            region_name=region["name"],
            protected_area=region.get("protected_area"),
            destination=dict(name=dest["name"], kind=dest["kind"], location=_loc(dest["lat"], dest["lon"]),
                             ele_m=_int(dest["ele"] or (float(ele[k]) if have_dem else None)), osm=dest["osm"]),
            start=dict(name=st.name, location=_loc(st.lat, st.lon),
                       ele_m=_int(st.ele or (float(ele[0]) if have_dem else None)), osm=st.osm),
            parking=parking[0] if parking else None,
            transit=stops[0] if stops else None,
            route="okruh" if back_path else "tam-a-spat",
            distance_m=int(round(walk_len)),
            ascent_m=int(round(up)),
            duration_min=duration,
            max_ele_m=_int(max_ele),
            difficulty=difficulty,
            family_friendly=family,
            marking=marking,
            marked_share=round(marked_len / total, 2) if total else 0.0,
            fees=fees,
            closure_rule_ids=closure_ids,
            rank=0,
            bbox=[round(float(lons_all.min()), 5), round(float(lats_all.min()), 5),
                  round(float(lons_all.max()), 5), round(float(lats_all.max()), 5)],
            curated=curated,
            gpx_url=f"/gpx/{slug}.gpx",
            path=path,
            turnaround_index=path_pts.index(turn),
            marking_runs=runs,
            parking_alternatives=parking[1:],
            transit_alternatives=stops[1:],
            pois=pois,
            _gpx=(lat, lon, ele if have_dem else None, rt, turn, bool(back_path)),
            _st=st,
            _path=out_path,
            _full=full,
        )
        return trip

    def _colour(self, way):
        cols = [self.g.routes[i]["colour"] for i in way.routes if self.g.routes[i]["colour"]]
        if not cols:
            return None
        return min(cols, key=lambda c: COLOUR_ORDER.index(c))

    def _fees(self, dest, rule_ids):
        fees = []
        t = dest["tags"]
        if t.get("fee") == "yes" or t.get("charge"):
            charge = t.get("charge")
            amount = _num(re.sub(r"[^\d.,]", " ", charge or "").replace(",", ".").split()[0]) if charge and re.search(r"\d", charge) else None
            fees.append(dict(kind="vstupne", text=f"Vstupné{': ' + charge if charge else ''}", amount_eur=amount,
                             source="osm", source_url=f"https://www.openstreetmap.org/{dest['osm']}" if dest["osm"] else None,
                             rule_id=None))
        for rid in rule_ids:
            r = next(x["rule"] for x in self.fees.rules if x["id"] == rid)
            fees.append(dict(kind="vstupne", text=r["text"], amount_eur=r.get("amount_eur"), source="rule",
                             source_url=r["source_url"], rule_id=rid))
        return fees

    def _collision_tag(self, dest, region):
        """What tells two places of one name apart in a slug: the nearest village, else the region
        (not the start's name: "ostredok-kralova-studna-hotel")."""
        if self._village_names is None:
            self._village_names = names.Places(getattr(self.osm, "places", []))
        village = self._village_names.nearest(dest["lat"], dest["lon"], avoid=dest["name"])
        return slugify(village, 24) if village else region["id"]

    def _slug(self, key, dest_name, tag):
        """Stable slug per destination: a new start for the same destination keeps the URL.
        On a name collision the slug gets `tag` (see _collision_tag)."""
        dest_key = key.split("|")[0]
        known = self.slugs.get(dest_key) or next(
            (v for k, v in self.slugs.items() if k.split("|")[0] == dest_key and v not in self.used_slugs), None)
        if known and known not in self.used_slugs:
            s = known
        else:
            base = slugify(dest_name)
            s = base
            taken = set(self.slugs.values()) | self.used_slugs
            if s in taken:
                s = f"{base}-{tag}"
            n = 2
            while s in taken:
                s = f"{base}-{n}"
                n += 1
        self.slugs[dest_key] = s
        self.used_slugs.add(s)
        return s

    @staticmethod
    def _describe(dest, st, marking, loop):
        n = dest["name"]
        ele = dest["ele"]
        first = {
            "vrchol": f"Výstup na vrchol {n}" + (f" ({int(ele)} m)" if ele else "") + ".",
            "vyhliadka": f"Výlet k vyhliadke {n}.",
            "hrad": f"Výlet k hradu: {n}.",
            "chata": f"Výlet k horskej chate: {n}.",
            "pleso": f"Výlet k plesu: {n}." if "pleso" in n.lower() else f"Výlet k vode: {n}.",
            "vodopad": f"Výlet k vodopádu: {n}.",
            "jaskyna": f"Výlet k jaskyni: {n}.",
            "roklina": f"Výlet do doliny: {n}." if "dolin" in n.lower() else f"Výlet do rokliny: {n}.",
        }.get(dest["kind"], f"Výlet: {n}.")
        # The loop is a property of the route, not part of the start's name: "Štart: X (okruh)."
        second = f"Štart: {st.name} (okruh)." if loop else f"Štart: {st.name}, späť rovnakou cestou."
        third = ""
        if marking:
            cols = [COLOUR_SK[c] for c in marking[:3]]
            third = " Po " + (" a ".join([", ".join(cols[:-1]), cols[-1]]) if len(cols) > 1 else cols[0]) + (" značke." if len(cols) == 1 else " značke.")
        return f"{first} {second}{third}"

    @staticmethod
    def _rank(trips):
        if not trips:
            return
        hi = max(t["_score"] for t in trips) or 1
        for t in trips:
            t["rank"] = int(round(100 * t.pop("_score") / hi))


# ---------------------------------------------------------------- utils --
SIDES4 = ["Zo severu", "Z východu", "Z juhu", "Zo západu"]
SIDES8 = ["Zo severu", "Zo severovýchodu", "Z východu", "Z juhovýchodu", "Z juhu", "Z juhozápadu", "Zo západu",
          "Zo severozápadu"]


def _sides(r):
    """Where a route's start lies seen from its goal, as a label: the nearest of four sides, then of eight."""
    s, d = r["start"].get("location"), r.get("destination", {}).get("location")
    if not s or not d:
        return []
    dx = (s["lon"] - d["lon"]) * math.cos(math.radians(d["lat"]))
    dy = s["lat"] - d["lat"]
    deg = math.degrees(math.atan2(dx, dy)) % 360
    return [SIDES4[int((deg + 45) // 90) % 4], SIDES8[int((deg + 22.5) // 45) % 8]]


def _same_goal(a, b):
    """Could two goal kinds this close be one place? A waterfall in a gorge, or a peak above one, is a
    goal of its own (Kmeťov vodopád, Závojový vodopád in Suchá Belá)."""
    if a == b:
        return True
    return not ({a, b} <= DISTINCT_GOALS or "roklina" in (a, b))


def _num(v):
    if v is None:
        return None
    try:
        x = float(str(v).replace(",", ".").split()[0].rstrip("m"))
    except (ValueError, IndexError):
        return None
    return x if math.isfinite(x) else None  # ele=nan, ele=inf


def _population(tags):
    try:
        return int(str(tags.get("population", "0")).replace(" ", "").replace(",", "").split(".")[0] or 0)
    except ValueError:
        return 0


def _int(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else int(round(v))


def _food(kind, f):
    """A food place's kind of food place (restaurant, café or bar, buffet) for its pictogram."""
    return {"food": osm_mod.food_kind(f.tags)} if kind == "obcerstvenie" else {}


def _loc(lat, lon):
    return dict(lat=round(float(lat), 6), lon=round(float(lon), 6))


def _cars(f):
    """Cars a car park holds: its capacity tag, else from its area, else a small one."""
    cap = _num(f.tags.get("capacity"))
    if cap:
        return cap
    area = f.tags.get("_area_m2")
    return area / 25 if area else 8


def _parking(d, f):
    fee = f.tags.get("fee")
    return dict(name=f.name, location=_loc(f.lat, f.lon), walk_m=int(round(d)),
                fee=True if fee == "yes" else False if fee == "no" else None, osm=f.osm)


def _stop(d, f):
    return dict(name=f.name, mode=f.tags["_mode"], location=_loc(f.lat, f.lon), walk_m=int(round(d)), osm=f.osm)


def _fill(a):
    a = np.asarray(a, float)
    ok = np.isfinite(a)
    if ok.all() or not ok.any():
        return a
    idx = np.arange(len(a))
    a[~ok] = np.interp(idx[~ok], idx[ok], a[ok])
    return a


def _smooth(a, w):
    if len(a) < w:
        return a
    k = np.ones(w) / w
    pad = w // 2
    return np.convolve(np.pad(a, pad, mode="edge"), k, mode="valid")
