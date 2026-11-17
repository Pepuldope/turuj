"""Every marked hiking trail in Slovakia for the map, coloured by popularity.

    python -m pipeline.network --pbf slovakia-latest.osm.pbf [--pageviews] [--root .]

Writes, under public/data/trails/:
    overview.json   all trails, simplified (~40 m), for the country view (packed, pipeline/packed.py)
    c/<ix>_<iy>.json the same trails in detail (~8 m), one file per grid cell
    meta.json       grid, counts, popularity cut-offs and the best-known goals

Popularity: there is no open "how many people walk this path" data that may
be used commercially (Strava forbids it). We use the next best open signal:
how often people read about the peaks, castles, waterfalls and viewpoints a
trail leads to (Wikipedia page views, CC0), spread to the trails around each
one, falling off with distance. Busy goals make the trails around them hot.

Each trail way is cut into pieces of at most PIECE_M so that one long ridge
route can be hot near Kriváň and quiet 20 km further on.
"""

import argparse
import datetime as dt
import json
import math
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import osmium
from scipy.spatial import cKDTree

from . import osm as osm_mod
from . import packed
from .geo import rdp_indices

UA = "Turuj trail map (https://github.com/Pepuldope/turuj; info@turuj.sk)"
VERSION = 1

PIECE_M = 600
MERGE_MAX_M = 3000
DETAIL_TOL_M = 8
OVERVIEW_TOL_M = 60
# A goal warms trails within this radius, halving about every 1.4 km (e-folding 2 km).
HEAT_RADIUS_M = 10000
HEAT_SCALE_M = 2000
# Share of trail length below each level's lower bound: 40 % quiet, then busier, top 6 % busiest.
LEVEL_CUTS = (0.40, 0.65, 0.83, 0.94)
# A little weight for national/international routes, so ties among quiet trails aren't random.
NETWORK_BONUS = {"iwn": 60, "nwn": 60, "rwn": 20, "lwn": 0}
# Grid for detail files.
GRID = dict(lon0=16.75, lat0=47.70, dx=0.5, dy=0.25)
WIKIS = ("skwiki", "cswiki", "enwiki", "plwiki", "huwiki", "dewiki")
# Projection centre for metric maths (Slovakia).
LAT0 = 48.7
KX = 111320.0 * math.cos(math.radians(LAT0))
KY = 110540.0


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def to_xy(lats, lons):
    return np.column_stack([(np.asarray(lons) - 19.5) * KX, (np.asarray(lats) - LAT0) * KY])


# ---------------------------------------------------------------- reading


def read(path):
    """Trail ways (with their KST colours and network) and goals that have a Wikidata id."""
    way_info = {}  # way id -> {"colours": set, "bonus": int}
    for r in osmium.FileProcessor(path, osmium.osm.RELATION):
        t = r.tags
        if t.get("type") != "route" or t.get("route") not in ("hiking", "foot"):
            continue
        colour = osm_mod.kst_colour(t)
        bonus = NETWORK_BONUS.get(t.get("network"), 0)
        for m in r.members:
            if m.type == "w":
                info = way_info.setdefault(m.ref, {"colours": set(), "bonus": 0})
                if colour:
                    info["colours"].add(colour)
                info["bonus"] = max(info["bonus"], bonus)

    ways, goals = [], []
    fp = (
        osmium.FileProcessor(path, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.EmptyTagFilter())
    )
    for o in fp:
        t = o.tags
        if o.is_way() and o.id in way_info:
            try:
                lats = [n.lat for n in o.nodes]
                lons = [n.lon for n in o.nodes]
            except osmium.InvalidLocationError:
                continue
            if len(lats) >= 2:
                ways.append(dict(id=o.id, lats=np.array(lats), lons=np.array(lons), **way_info[o.id]))
        qid = t.get("wikidata")
        if not qid:
            continue
        tags = dict(t)
        kind = osm_mod.destination_kind(tags) or ("vyhliadka" if tags.get("tourism") == "attraction" else None)
        if not kind:
            continue
        if o.is_node():
            lat, lon = o.location.lat, o.location.lon
        else:
            try:
                lat = float(np.mean([n.lat for n in o.nodes]))
                lon = float(np.mean([n.lon for n in o.nodes]))
            except osmium.InvalidLocationError:
                continue
        goals.append(dict(qid=qid, name=osm_mod.clean_name(tags), kind=kind, lat=lat, lon=lon))
    return ways, goals


# ---------------------------------------------------------------- popularity


def _get(url, tries=5):
    """GET JSON with backoff on rate limits and server errors; 404 -> {} (no such article/data)."""
    for k in range(tries):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {}
            if e.code not in (429, 500, 502, 503, 504) or k == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if k == tries - 1:
                raise
        time.sleep(2 ** k)
    return {}


def last_12_months(today=None):
    """[first day of the month a year ago, last day of last month] as YYYYMMDD strings."""
    today = today or dt.date.today()
    end = today.replace(day=1) - dt.timedelta(days=1)
    start = (end.replace(day=1) - dt.timedelta(days=330)).replace(day=1)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def article_views(wiki, title, start, end):
    """Views of one article, or None when it couldn't be fetched (so it isn't cached as 0)."""
    project = f"{wiki[:-4]}.wikipedia"
    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
        f"{project}/all-access/user/{urllib.parse.quote(title.replace(' ', '_'), safe='')}/monthly/{start}/{end}"
    )
    try:
        return sum(i["views"] for i in _get(url).get("items", []))
    except Exception as e:
        log(f"pageviews {wiki} {title}: {e}")
        return None


def pageviews(qids, cache_file):
    """Yearly Wikipedia page views per Wikidata id, summed over the languages in WIKIS (cached per month)."""
    start, end = last_12_months()
    cache = {}
    if cache_file.exists():
        cache = json.loads(cache_file.read_text())
    # zeros are re-checked: an article with no views is rare, a failed lookup isn't
    out = {q: c["views"] for q, c in cache.items() if c.get("end") == end and c.get("views")}
    todo = sorted(set(qids) - set(out))
    log(f"pageviews: {len(out)} cached, {len(todo)} to fetch")

    titles = {}  # qid -> [(wiki, title)]
    for i in range(0, len(todo), 50):
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&format=json&ids="
               + "|".join(todo[i : i + 50]))
        try:
            for q, e in _get(url).get("entities", {}).items():
                links = e.get("sitelinks", {})
                titles[q] = [(w, links[w]["title"]) for w in WIKIS if w in links]
        except Exception as e:
            log(f"wikidata batch {i}: {e}")

    jobs = [(q, w, t) for q, lst in titles.items() for w, t in lst]
    log(f"pageviews: {len(jobs)} articles for {len(titles)} goals")
    with ThreadPoolExecutor(max_workers=3) as pool:
        views = list(pool.map(lambda j: article_views(j[1], j[2], start, end), jobs))
    failed = set()
    for (q, _, _), v in zip(jobs, views):
        if v is None:
            failed.add(q)
        else:
            out[q] = out.get(q, 0) + v
    for q in todo:
        if q in failed or q not in titles:
            continue  # try again next run
        out.setdefault(q, 0)
        cache[q] = {"views": out[q], "end": end}
    log(f"pageviews: {len(failed)} goals failed, {sum(1 for v in out.values() if v)} with views")
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(cache))
    return out


# ---------------------------------------------------------------- pieces and heat


def split_way(way, piece_m=PIECE_M):
    """Cut a way into runs of vertices no longer than piece_m (consecutive pieces share an end vertex)."""
    xy = to_xy(way["lats"], way["lons"])
    seg = np.hypot(*np.diff(xy, axis=0).T)
    pieces, start, acc = [], 0, 0.0
    for i, d in enumerate(seg):
        acc += d
        if acc >= piece_m and i + 1 < len(seg):
            pieces.append((start, i + 1, acc))
            start, acc = i + 1, 0.0
    pieces.append((start, len(xy) - 1, acc))
    return xy, pieces


def heat_at(points_xy, goals_xy, goal_views):
    """Sum over goals of views * exp(-distance / HEAT_SCALE_M), within HEAT_RADIUS_M."""
    if len(goals_xy) == 0:
        return np.zeros(len(points_xy))
    tree = cKDTree(goals_xy)
    out = np.zeros(len(points_xy))
    for i, near in enumerate(tree.query_ball_point(points_xy, HEAT_RADIUS_M)):
        if near:
            d = np.hypot(*(goals_xy[near] - points_xy[i]).T)
            out[i] = float(np.sum(goal_views[near] * np.exp(-d / HEAT_SCALE_M)))
    return out


def levels(heat, length, cuts=LEVEL_CUTS):
    """Level 0..len(cuts) per piece from where its heat sits in the length-weighted distribution.

    Returns (levels, heat value at each cut) so the report can say what "busy" means.
    """
    if len(heat) == 0:
        return np.zeros(0, dtype=int), []
    order = np.argsort(heat, kind="stable")
    total = float(length.sum())
    # share of all trail length that is quieter than the middle of each piece
    share = (np.cumsum(length[order]) - length[order] / 2) / total
    lv = np.empty(len(heat), dtype=int)
    lv[order] = np.searchsorted(np.asarray(cuts), share, side="right")
    cut_heat = [float(heat[order][min(int(np.searchsorted(share, c)), len(order) - 1)]) for c in cuts]
    return lv, cut_heat


# ---------------------------------------------------------------- output


def simplify(lats, lons, tol_m, digits):
    xy = to_xy(lats, lons)
    keep = rdp_indices(xy, tol_m) if len(xy) > 2 else list(range(len(xy)))
    return [[round(float(lons[k]), digits), round(float(lats[k]), digits)] for k in keep]


def cell_of(lat, lon):
    return f"{int((lon - GRID['lon0']) // GRID['dx'])}_{int((lat - GRID['lat0']) // GRID['dy'])}"


def build(ways, goals, views, border=None):
    """Runs of trail with a popularity level, ready to write."""
    goals = [g for g in goals if views.get(g["qid"], 0) > 0]
    goals_xy = to_xy([g["lat"] for g in goals], [g["lon"] for g in goals]) if goals else np.zeros((0, 2))
    goal_views = np.array([views[g["qid"]] for g in goals], dtype=float)

    pieces = []  # (way index, i0, i1, length, mid xy, bonus)
    for wi, w in enumerate(ways):
        xy, cuts = split_way(w)
        for i0, i1, length in cuts:
            mid = xy[(i0 + i1) // 2] if i1 - i0 > 1 else (xy[i0] + xy[i1]) / 2
            pieces.append((wi, i0, i1, max(length, 1.0), mid, w["bonus"]))
    if border is not None:
        from shapely.geometry import Point
        from shapely.prepared import prep

        inside = prep(border.buffer(0.02))
        keep = []
        for p in pieces:
            lon = p[4][0] / KX + 19.5
            lat = p[4][1] / KY + LAT0
            if inside.contains(Point(lon, lat)):
                keep.append(p)
        pieces = keep
    if not pieces:
        return [], {}

    mids = np.array([p[4] for p in pieces])
    heat = heat_at(mids, goals_xy, goal_views) + np.array([p[5] for p in pieces], dtype=float)
    length = np.array([p[3] for p in pieces])
    lv, cut_values = levels(heat, length)

    # merge consecutive pieces of a way that share a level, up to MERGE_MAX_M
    runs = []
    for (wi, i0, i1, ln, _, _), level in zip(pieces, lv):
        last = runs[-1] if runs else None
        if last and last["way"] == wi and last["i1"] == i0 and last["level"] == level and last["len"] + ln <= MERGE_MAX_M:
            last["i1"], last["len"] = i1, last["len"] + ln
        else:
            runs.append(dict(way=wi, i0=i0, i1=i1, level=int(level), len=ln))
    stats = dict(
        km=round(float(length.sum()) / 1000),
        pieces=len(pieces),
        level_km=[round(float(length[lv == k].sum()) / 1000) for k in range(len(LEVEL_CUTS) + 1)],
        cuts=[round(c) for c in cut_values],
        top_goals=[dict(name=g["name"], kind=g["kind"], views=int(views[g["qid"]]))
                   for g in sorted(goals, key=lambda g: -views[g["qid"]])[:25]],
    )
    return runs, stats


COLOUR_CODE = {"red": "r", "blue": "b", "green": "g", "yellow": "y", "black": "k"}


def colour_code(colours):
    """The KST colours of a way as a short sorted code ("bg" = blue and green), "" when unknown."""
    return "".join(sorted(COLOUR_CODE[c] for c in colours if c in COLOUR_CODE))


def merged_features(lines_by_key):
    """Join touching runs of the same level (and marking, in the detail cells) into long lines:
    far fewer features, far smaller files. Keys are a level, or (level, colour code)."""
    from shapely.geometry import MultiLineString
    from shapely.ops import linemerge

    feats = []
    for key in sorted(lines_by_key):
        lines = [l for l in lines_by_key[key] if len(l) >= 2]
        if not lines:
            continue
        level, code = key if isinstance(key, tuple) else (key, None)
        props = {"p": int(level)} if code is None else {"p": int(level), "c": code}
        merged = linemerge(MultiLineString(lines))
        parts = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
        for g in parts:
            feats.append({
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "LineString", "coordinates": [list(c) for c in g.coords]},
            })
    return feats


def write(root, ways, runs, stats, osm_ts=None):
    out = Path(root) / "public" / "data" / "trails"
    cells_dir = out / "c"
    cells_dir.mkdir(parents=True, exist_ok=True)
    for f in cells_dir.glob("*.json"):
        f.unlink()
    overview, cells = {}, {}
    for run in runs:
        w = ways[run["way"]]
        sl = slice(run["i0"], run["i1"] + 1)
        lats, lons = w["lats"][sl], w["lons"][sl]
        overview.setdefault(run["level"], []).append(simplify(lats, lons, OVERVIEW_TOL_M, 4))
        detail = simplify(lats, lons, DETAIL_TOL_M, 5)
        mid = detail[len(detail) // 2]
        # The detail cells carry each line's KST colours too: the trip page reads which marking a
        # side walk to a stop follows (Peter, 2026-10-29).
        key = (run["level"], colour_code(w["colours"]))
        cells.setdefault(cell_of(mid[1], mid[0]), {}).setdefault(key, []).append(detail)
    packed.dump(out / "overview.json", merged_features(overview), 4)
    for key, by_key in cells.items():
        packed.dump(cells_dir / f"{key}.json", merged_features(by_key), 5)
    meta = dict(
        version=VERSION,
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        osm_data_at=osm_ts,
        attribution="© OpenStreetMap contributors (ODbL); popularity from Wikipedia page views (Wikimedia, CC0)",
        grid=GRID,
        cells=sorted(cells),
        levels=len(LEVEL_CUTS) + 1,
        **stats,
    )
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return meta


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--root", default=".")
    ap.add_argument("--pageviews", action="store_true", help="fetch Wikipedia page views (needs network)")
    ap.add_argument("--osm-timestamp", default=None)
    ap.add_argument("--border-relation", type=int, default=14296)
    a = ap.parse_args(argv)
    root = Path(a.root)

    log("reading OSM")
    ways, goals = read(a.pbf)
    log(f"trail ways {len(ways)}, goals with wikidata {len(goals)}")
    views = pageviews([g["qid"] for g in goals], root / "pipeline" / ".cache" / "pageviews.json") if a.pageviews else {}
    border = osm_mod._border(a.pbf, a.border_relation) if a.border_relation else None
    runs, stats = build(ways, goals, views, border)
    if not runs:
        log("no trails found")
        return 1
    meta = write(root, ways, runs, stats, a.osm_timestamp)
    log(f"{meta['km']} km of trails in {len(runs)} runs, {len(meta['cells'])} cells, km per level {meta['level_km']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
