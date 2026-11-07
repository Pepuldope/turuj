"""Read what the trip pipeline needs from an OpenStreetMap extract (.osm.pbf or .osm).

Two passes over the file: hiking route relations first (relations come last in
the file, and we need them to know which ways are marked), then nodes and ways
with locations. A short pass after that places the goals mapped as relations (a castle
drawn as a multipolygon, Strečno) at the centre of their member ways. A last, optional pass
assembles the country border to keep only Slovak towns and trailheads.
"""

from types import SimpleNamespace

from dataclasses import dataclass, field

import numpy as np
import osmium

WALK_HIGHWAYS = {
    "path", "footway", "track", "steps", "bridleway", "pedestrian", "cycleway", "ladder",
    "residential", "unclassified", "service", "living_street", "tertiary", "road",
}
FOOTPATHS = {"path", "footway", "track", "steps", "bridleway", "pedestrian", "cycleway", "ladder"}
SAC = {
    "hiking": 1, "mountain_hiking": 2, "demanding_mountain_hiking": 3,
    "alpine_hiking": 4, "demanding_alpine_hiking": 5, "difficult_alpine_hiking": 6,
}
KST_COLOURS = {"red": "red", "blue": "blue", "green": "green", "yellow": "yellow", "black": "black"}
NO_ACCESS = {"no", "private"}
FOOT_OK = {"yes", "designated", "permissive"}
# way tags kept for rule selectors (fee-rules.json way_tags)
WATCH_TAGS = {"highway", "ladder", "oneway", "oneway:foot"}


@dataclass
class Feature:
    osm: str
    name: str | None
    lat: float
    lon: float
    tags: dict


@dataclass
class Way:
    id: int
    nodes: np.ndarray  # OSM node ids
    lats: np.ndarray
    lons: np.ndarray
    highway: str
    sac: int
    oneway: int  # 0 both ways, 1 forward only, -1 backward only (walking)
    routes: list  # indices into OsmData.routes
    tags: frozenset  # "k=v" strings from WATCH_TAGS


@dataclass
class OsmData:
    routes: list = field(default_factory=list)  # dicts: id, ref, colour, name
    ways: list = field(default_factory=list)
    guideposts: list = field(default_factory=list)
    parking: list = field(default_factory=list)
    stops: list = field(default_factory=list)
    destinations: list = field(default_factory=list)  # (kind, Feature)
    pois: list = field(default_factory=list)  # (kind, Feature)
    towns: list = field(default_factory=list)
    places: list = field(default_factory=list)  # villages and towns near trails (how well known a start is)
    included: dict = field(default_factory=dict)  # osm ref -> Feature, for the config `include:` list (any kind of object)
    others: list = field(default_factory=list)  # well-known named features that are no goal kind (report only)
    probes: dict = field(default_factory=dict)  # name -> [(lat, lon)]
    named: list = field(default_factory=list)  # (name, plain name, lat, lon) whose plain name holds a name_keys entry
    border: object = None  # shapely geometry of the country, or None
    data_at: str | None = None


def kst_colour(tags):
    """Trail colour from osmc:symbol ('red:white:red_bar') or colour."""
    sym = tags.get("osmc:symbol", "")
    for part in [sym.split(":")[0], sym.split(":")[2].split("_")[0] if sym.count(":") >= 2 else ""]:
        if part in KST_COLOURS:
            return KST_COLOURS[part]
    return KST_COLOURS.get(tags.get("colour", "").lower())


def plain(name):
    """Lower case without diacritics, for loose name matching ("Rázcestie nad Žabím potokom")."""
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFKD", name.lower()) if not unicodedata.combining(c))


def clean_name(t):
    """Slovak name: name:sk if present, else the first part of bilingual names like 'Volovec / Wołowiec'."""
    name = t.get("name:sk") or t.get("name")
    if name and " / " in name:
        name = name.split(" / ")[0].strip()
    return name


# Gorges people walk through: Jánošíkove diery, Zejmarská roklina, Prielom Hornádu, Kyseľ (tiesňava).
GORGE_WORDS = __import__("re").compile(r"roklin|tiesňav|diery|prielom|kaňon|soutěsk", __import__("re").I)
VALLEYS = ("valley", "gully", "gorge", "canyon")
GORGE_MAX_M = 4500  # a valley this short with an article is a gorge (Suchá Belá, Sokolia dolina); longer is a valley
ROCKS = ("rock", "stone", "cliff", "arch", "rock_formation", "bare_rock")
NOT_SIGHTS = ("historic", "building", "amenity", "man_made", "religion", "memorial", "railway", "leisure", "shop",
              "office", "craft", "place", "landuse", "waterway")
MAIN_KEYS = ("natural", "tourism", "historic", "leisure", "man_made", "waterway", "boundary", "amenity", "landuse",
             "geological", "building", "place")


def main_tag(t):
    return next((f"{k}={t[k]}" for k in MAIN_KEYS if t.get(k)), "?")


def destination_kind(t):
    name = t.get("name", "")
    low = name.lower()
    if t.get("natural") == "peak":
        return "vrchol"
    if t.get("man_made") == "tower" and t.get("tower:type") == "observation":
        return "vyhliadka"
    if t.get("tourism") == "viewpoint":
        return "vyhliadka"
    if t.get("historic") == "castle" and t.get("castle_type") not in ("palace", "manor", "stately", "citywalls"):
        return "hrad"
    if t.get("historic") == "ruins" and (t.get("ruins") == "castle" or "hrad" in low):
        return "hrad"
    if t.get("tourism") == "alpine_hut":
        return "chata"
    if t.get("waterway") == "waterfall":
        return "vodopad"
    if t.get("natural") == "water" and ("pleso" in low or (
            # a lake people travel to (Morské oko, a Štiavnica tajch), not every fishing pond: it has an article
            (t.get("wikipedia") or t.get("wikidata")) and t.get("water") in (None, "lake", "oxbow")
            and any(w in low for w in ("jazero", "oko", "tajch")))):
        return "pleso"
    if t.get("natural") == "cave_entrance" and (t.get("show_cave") == "yes" or t.get("tourism") == "attraction" or t.get("fee")):
        return "jaskyna"
    if "ferrat" in low:
        return None  # a via ferrata is a climb, not a walk ("Via Ferrata Skalka (... Jánošíkove diery)")
    known = t.get("wikipedia") or t.get("wikidata")
    gorge_word = GORGE_WORDS.search(name) or GORGE_WORDS.search(t.get("wikipedia", ""))
    cirque = any(w in low for w in ("kotlin", "kotol"))  # "Kotlina pod Prielomom" is a Tatra cirque
    if t.get("natural") in VALLEYS and not cirque and (gorge_word or t.get("natural") in ("gorge", "canyon") or (
            known and t.get("_len_m", 0) <= GORGE_MAX_M)):
        return "roklina"
    if t.get("tourism") == "attraction" and gorge_word and t.get("natural") not in ("saddle", "peak"):
        return "roklina"  # Jánošíkove diery is mapped as one point
    # A sight in nature with its own article: a rock town, a famous rock, Kláštorisko. Not churches,
    # memorials, manors or museums that happen to be tagged as attractions.
    if known and t.get("natural") not in ("saddle", "peak") and (t.get("natural") in ROCKS or (
            t.get("tourism") == "attraction" and not any(t.get(k) for k in NOT_SIGHTS))):
        return "ine"
    return None


def poi_kind(t):
    if t.get("tourism") == "viewpoint" or t.get("tower:type") == "observation":
        return "vyhliadka"
    # Ruins of anything (a bunker, a chapel) are not a castle.
    if t.get("historic") == "castle" or (t.get("historic") == "ruins" and (
            t.get("ruins") == "castle" or "hrad" in t.get("name", "").lower())):
        return "hrad"
    if t.get("tourism") in ("alpine_hut", "chalet"):
        return "chata"
    if t.get("tourism") == "wilderness_hut" or t.get("amenity") == "shelter":
        return "utulna"
    if t.get("amenity") in ("restaurant", "pub", "fast_food", "cafe"):
        return "obcerstvenie"
    if t.get("natural") == "spring" or t.get("amenity") == "drinking_water":
        return "pramen"
    if t.get("leisure") == "playground":
        return "ihrisko"
    return None


def food_kind(t):
    """Which pictogram a food place gets on the site (lib/food.ts): restaurant, café or bar, or buffet.
    Mountain buffets are often tagged as restaurants, so the name decides those."""
    if t.get("amenity") == "fast_food" or "bufet" in (t.get("name") or "").lower():
        return "bufet"
    if t.get("amenity") in ("cafe", "pub", "bar"):
        return "kaviaren"
    return "restauracia"


def stop_mode(t):
    if t.get("railway") in ("station", "halt") and t.get("station") not in ("subway", "funicular"):
        return "vlak"
    if t.get("railway") == "tram_stop":
        return "elektricka"
    if t.get("highway") == "bus_stop" or (t.get("public_transport") == "platform" and t.get("bus") == "yes"):
        return "autobus"
    return None


PLACES = ("city", "town", "village", "suburb", "hamlet")


def _area_m2(lats, lons):
    """Area of a closed way (shoelace on a local flat projection)."""
    k = np.cos(np.radians(lats.mean()))
    x, y = lons * 111320.0 * k, lats * 110540.0
    return float(abs(np.dot(x[:-1], y[1:]) - np.dot(x[1:], y[:-1])) / 2)


def parking_ok(t):
    return (
        t.get("amenity") == "parking"
        and t.get("access") not in ("private", "no", "customers", "permit")
        and t.get("parking") not in ("garage_boxes", "carports")
    )


class _Boxes:
    def __init__(self, boxes, pad):
        self.b = [(w - pad, s - pad, e + pad, n + pad) for w, s, e, n in boxes]

    def __contains__(self, latlon):
        lat, lon = latlon
        return any(w <= lon <= e and s <= lat <= n for w, s, e, n in self.b)

    def overlaps(self, lat0, lon0, lat1, lon1):
        return any(lon0 <= e and lon1 >= w and lat0 <= n and lat1 >= s for w, s, e, n in self.b)


def load(path, boxes, probe_names=(), border_relation=14296, name_keys=(), include=()):
    """Read everything inside `boxes` ([w,s,e,n] list), plus towns and probes anywhere. Named features
    inside the boxes whose plain() name contains one of `name_keys` go to `named` (closure sections).
    `include` is the config list of hand-picked objects ({osm: "way/65383743", kind, ...}); each one found
    inside the boxes ends in `data.included`, whatever its tags say."""
    include = {e["osm"]: e for e in include}
    data = OsmData()
    feature_box = _Boxes(boxes, 0.03)
    way_box = _Boxes(boxes, 0.05)
    probe_names = set(probe_names)
    name_keys = tuple(set(name_keys))

    # pass 1: hiking routes
    way_routes = {}
    rel_goals = {}  # goals mapped as a relation (a castle as a multipolygon): placed after pass 2
    for r in osmium.FileProcessor(path, osmium.osm.RELATION):
        t = r.tags
        if t.get("type") == "route" and t.get("route") in ("hiking", "foot"):
            idx = len(data.routes)
            data.routes.append(dict(id=r.id, ref=t.get("ref"), colour=kst_colour(t), name=t.get("name")))
            for m in r.members:
                if m.type == "w":
                    way_routes.setdefault(m.ref, []).append(idx)
        elif t.get("type") in ("multipolygon", "site") and (
                (t.get("name") and destination_kind(dict(t))) or f"relation/{r.id}" in include):
            site = t.get("type") == "site"
            rel_goals[r.id] = dict(
                tags=dict(t),
                ways=[m.ref for m in r.members if m.type == "w" and (site or m.role in ("outer", ""))],
                nodes=[m.ref for m in r.members if m.type == "n" and m.role in ("label", "admin_centre")],
            )

    # pass 2: nodes and ways
    def add_feature(o, lat, lon, osm_ref, extra=None):
        t = dict(o.tags)
        if extra:
            t.update(extra)
        name = clean_name(t) or (include.get(osm_ref) or {}).get("name")
        if t.get("name") in probe_names or name in probe_names:
            data.probes.setdefault(name, []).append((lat, lon))
        if name and name_keys and (lat, lon) in feature_box:
            p = plain(name)
            if any(k in p for k in name_keys):
                data.named.append((name, p, lat, lon))
        if t.get("place") in PLACES and name and osm_ref.startswith("node") and (lat, lon) in feature_box:
            data.places.append(Feature(osm_ref, name, lat, lon, {"place": t["place"]}))
        if t.get("place") in ("city", "town") and name and osm_ref.startswith("node"):
            data.towns.append(Feature(osm_ref, name, lat, lon, t))
            return
        if (lat, lon) not in feature_box:
            return
        f = Feature(osm_ref, name, lat, lon, t)
        if osm_ref in include:
            data.included[osm_ref] = f
            return
        if t.get("tourism") == "information" and t.get("information") == "guidepost":
            data.guideposts.append(f)
            return
        if parking_ok(t):
            data.parking.append(f)
            return
        mode = stop_mode(t)
        if mode and name:
            f.tags["_mode"] = mode
            data.stops.append(f)
            return
        if name:
            kind = destination_kind(t)
            if kind:
                data.destinations.append((kind, f))
            elif t.get("wikidata") and not any(t.get(k) for k in ("place", "landuse", "building", "boundary",
                                                                   "highway", "waterway", "route")):
                data.others.append(f)
            pk = poi_kind(t)
            if pk:
                data.pois.append((pk, f))

    fp = (
        osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.EmptyTagFilter())
    )
    for o in fp:
        if o.is_node():
            add_feature(o, o.location.lat, o.location.lon, f"node/{o.id}")
            continue
        t = o.tags
        hw = t.get("highway")
        walk = hw in WALK_HIGHWAYS
        feature = hw is None and ("name" in t or t.get("amenity") == "parking")
        if not (walk or feature):
            continue
        try:
            lats = np.array([n.lat for n in o.nodes])
            lons = np.array([n.lon for n in o.nodes])
        except osmium.InvalidLocationError:
            continue
        if len(lats) == 0:
            continue
        if walk and len(lats) >= 2 and way_box.overlaps(lats.min(), lons.min(), lats.max(), lons.max()):
            access_blocked = t.get("access") in NO_ACCESS and t.get("foot") not in FOOT_OK
            if not access_blocked and t.get("foot") != "no" and t.get("area") != "yes":
                ow_tag = t.get("oneway:foot") or (t.get("oneway") if hw in FOOTPATHS else None)
                oneway = 1 if ow_tag in ("yes", "1", "true") else -1 if ow_tag == "-1" else 0
                data.ways.append(Way(
                    id=o.id,
                    nodes=np.array([n.ref for n in o.nodes], dtype=np.int64),
                    lats=lats,
                    lons=lons,
                    highway=hw,
                    sac=SAC.get(t.get("sac_scale"), 0),
                    oneway=oneway,
                    routes=way_routes.get(o.id, []),
                    tags=frozenset(f"{k}={t.get(k)}" for k in WATCH_TAGS if k in t),
                ))
        if feature:
            extra = None
            if t.get("amenity") == "parking" and len(lats) >= 4 and o.nodes[0].ref == o.nodes[-1].ref:
                extra = {"_area_m2": _area_m2(lats, lons)}
            elif t.get("natural") in VALLEYS and len(lats) >= 2:
                # a gorge is a line: the trip goes to its upper end (trips.py), not to the middle of the line
                seg = _line_m(lats, lons)
                extra = {"_len_m": seg, "_ends": ((float(lats[0]), float(lons[0])), (float(lats[-1]), float(lons[-1])))}
            add_feature(o, float(lats.mean()), float(lons.mean()), f"way/{o.id}", extra)

    # pass 3: where the relation goals are (the centre of their member ways, or their label node)
    if rel_goals:
        want_ways = {w for g in rel_goals.values() for w in g["ways"]}
        want_nodes = {n for g in rel_goals.values() for n in g["nodes"]}
        way_mid, node_at = {}, {}
        fp3 = (
            osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY)
            .with_locations()
            .with_filter(osmium.filter.IdFilter(list(want_ways | want_nodes)))
        )
        for o in fp3:
            if o.is_node():
                if o.id in want_nodes:
                    node_at[o.id] = (o.location.lat, o.location.lon)
            elif o.id in want_ways:
                try:
                    pts = [(n.lat, n.lon) for n in o.nodes]
                except osmium.InvalidLocationError:
                    continue
                if pts:
                    way_mid[o.id] = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        for rid, g in rel_goals.items():
            pts = [node_at[n] for n in g["nodes"] if n in node_at] or [way_mid[w] for w in g["ways"] if w in way_mid]
            if pts:
                lat, lon = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
                add_feature(SimpleNamespace(tags=g["tags"]), lat, lon, f"relation/{rid}")

    if border_relation:
        data.border = _border(path, border_relation)
        if data.border is not None:
            from shapely.geometry import Point

            data.towns = [f for f in data.towns if data.border.contains(Point(f.lon, f.lat))]
    return data


def _line_m(lats, lons):
    """Length of a line in metres (equirectangular, fine for a few km)."""
    k = np.cos(np.radians(lats.mean()))
    return float(np.hypot(np.diff(lats), np.diff(lons) * k).sum() * 111_320)


def _border(path, relation_id):
    """Country polygon from the admin boundary relation, or None when it isn't in the file."""
    import shapely.wkb

    wkb = osmium.geom.WKBFactory()
    fp = (
        osmium.FileProcessor(path)
        .with_areas(osmium.filter.TagFilter(("admin_level", "2")))
        .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
        .with_filter(osmium.filter.IdFilter([relation_id * 2 + 1]))
    )
    for o in fp:
        if o.is_area() and not o.from_way() and o.orig_id() == relation_id:
            try:
                return shapely.wkb.loads(wkb.create_multipolygon(o), hex=True)
            except Exception:
                return None
    return None
