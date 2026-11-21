"""Real-terrain pictures for the places without a photo (C201; drawn by lib/terrainScene.ts).

For each place without a photo in public/data/photos.json (main trip per destination, highest `rank`) this
works out what the land around it really looks like: the skyline seen from a viewpoint, in three depth layers
(elevation angle per view column). Elevation: AWS Terrain Tiles (terrarium PNG, zoom 12, Mapzen / open data).

- Peaks, castles, lookouts, huts (`vrchol, hrad, vyhliadka, chata`): a viewer 3.5-13 km out, 200 m above the
  ground, 12 directions x 4 distances; the view where the place stands out best wins (a bias to the side the
  trail comes from). Three bands: near, the place's own, far.
- Everything else (`vodopad, pleso, roklina, jaskyna, ine`): the viewer stands AT the place (a lake: 120 m back on
  the approach side), eye 2 m up (gorge 3 m), bands 60-700 / 700-3000 / 3000+ m, and the look direction with
  the highest skyline (a gorge: walls high, middle low) wins.

The 241 columns of an 80 degree view are cut to the two windows the site draws (card: 34 degrees with the place
at 0.75 across; banner: 64 degrees centred), simplified to the pixel and stored as ints in 0.05 degree, delta
coded (see `pack_layer`). Output, both without any date so an unchanged run changes no file:

    data/terrain.json                full data, read at build time (trip-page banner); also the cache
    public/data/terrain-cards.json   card windows only, {v, places: {id: [kind, near, mid, far]}, trips: {slug: id}}

A place is computed once and kept while (id, lat, lon, ALGO) stay the same; places that now have a photo drop out.

    python -m pipeline.terrain                       # all places without a photo (about 1,300)
    python -m pipeline.terrain --only "Kriváň,Mača" --out /tmp/terrain   # a sample, into another folder
"""

import argparse
import functools
import io
import json
import math
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

# Bump when the algorithm or the packing changes: every place is then computed again.
ALGO = 1
FORMAT = 1
Z = 12
TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
UA = "Turuj terrain (https://github.com/Pepuldope/turuj)"
TILES = Path(os.environ.get("TERRAIN_TILES", "pipeline/.cache/terrain"))
INDEX = Path("public/data/trips/index.json")
PHOTOS = Path("public/data/photos.json")
OUT_FULL = Path("data/terrain.json")
OUT_CARDS = Path("public/data/terrain-cards.json")

R_EARTH = 6371000.0
FOV = 80.0
COLS = 241
C = COLS // 2
STEP = 0.05  # degrees per stored unit

# Order matters: the card file stores the index. Same list in lib/terrainScene.ts.
KINDS = ["vrchol", "hrad", "vyhliadka", "chata", "vodopad", "pleso", "roklina", "jaskyna", "ine"]
PEAK_KINDS = {"vrchol", "hrad", "vyhliadka", "chata"}
# A summit is snapped to the highest elevation point within 120 m of the mapped spot; a hut stays where it is mapped.
SNAP_KINDS = {"vrchol", "hrad", "vyhliadka"}

# The two windows, in columns of the 241-column view: (first column, columns, width px, px per degree
# of the smallest vertical scale, simplify tolerance px). Same numbers as lib/terrainScene.ts.
WINDOWS = {
    "card": dict(first=43, n=103, w=96.0, ky=96.0 / 34 * 1.6, tol=0.5),
    "banner": dict(first=24, n=193, w=360.0, ky=360.0 / 64 * 1.6, tol=0.5),
}


def log(msg):
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- elevation tiles

class TileError(Exception):
    pass


def tile_xy(lat, lon, z=Z):
    n = 2 ** z
    x = (np.asarray(lon, dtype=float) + 180) / 360 * n
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
    return x, y


def tile_path(x, y, z=Z):
    return TILES / f"{z}-{x}-{y}.png"


def fetch_tile(x, y, z=Z):
    """Download one terrarium tile into the disk cache (kept for the whole run, and by the job's cache)."""
    p = tile_path(x, y, z)
    if p.exists():
        return p
    p.parent.mkdir(parents=True, exist_ok=True)
    last = None
    for wait in (0, 2, 6, 15):
        time.sleep(wait)
        try:
            req = urllib.request.Request(TILE_URL.format(z=z, x=x, y=y), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            Image.open(io.BytesIO(data)).verify()
            tmp = p.with_suffix(".part")
            tmp.write_bytes(data)
            tmp.replace(p)
            return p
        except Exception as e:  # network hiccup: retry, then give the place up until next week
            last = e
    raise TileError(f"tile {z}/{x}/{y}: {last}")


@functools.lru_cache(maxsize=300)
def load_tile(x, y, z=Z):
    """Elevation in metres, 256 x 256 float32 (terrarium: R*256 + G + B/256 - 32768)."""
    a = np.asarray(Image.open(fetch_tile(x, y, z)).convert("RGB"), dtype=np.float32)
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768


class Dem:
    """A stitched block of tiles around a point, sampled with bilinear interpolation (vectorised)."""

    def __init__(self, lat, lon, radius_m, loader=None):
        dlat = radius_m / 111320
        dlon = radius_m / (111320 * math.cos(math.radians(lat)))
        x0, y0 = tile_xy(lat + dlat, lon - dlon)
        x1, y1 = tile_xy(lat - dlat, lon + dlon)
        self.tx0, self.ty0 = int(x0), int(y0)
        tx1, ty1 = int(x1), int(y1)
        coords = [(tx, ty) for ty in range(self.ty0, ty1 + 1) for tx in range(self.tx0, tx1 + 1)]
        get = loader or load_tile
        if loader is None:
            with ThreadPoolExecutor(8) as ex:  # downloads in parallel, decoding after
                list(ex.map(lambda t: fetch_tile(*t), coords))
        rows = [np.hstack([get(tx, ty) for tx in range(self.tx0, tx1 + 1)]) for ty in range(self.ty0, ty1 + 1)]
        self.a = np.vstack(rows)

    @classmethod
    def from_array(cls, a, tx0=0, ty0=0):
        d = cls.__new__(cls)
        d.a, d.tx0, d.ty0 = np.asarray(a, dtype=np.float32), tx0, ty0
        return d

    def h(self, lat, lon):
        x, y = tile_xy(lat, lon)
        x = np.clip((x - self.tx0) * 256, 0, self.a.shape[1] - 2)
        y = np.clip((y - self.ty0) * 256, 0, self.a.shape[0] - 2)
        x0 = np.floor(x).astype(int)
        y0 = np.floor(y).astype(int)
        fx, fy = x - x0, y - y0
        a = self.a
        return (a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy)
                + a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy)

    def h1(self, lat, lon):
        return float(self.h(np.array([lat]), np.array([lon]))[0])


def offset(lat, lon, bearing_deg, dist_m):
    b = math.radians(bearing_deg)
    return (lat + dist_m * math.cos(b) / 111320,
            lon + dist_m * math.sin(b) / (111320 * math.cos(math.radians(lat))))


def bearing(lat1, lon1, lat2, lon2):
    y = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    x = lat2 - lat1
    return math.degrees(math.atan2(y, x)) % 360


# ---------------------------------------------------------------- views

def rays(dem, vlat, vlon, eye, azs, r):
    """Elevation angle (degrees) of the ground along each ray: shape (len(azs), len(r)). All columns at once."""
    b = np.radians(np.asarray(azs, dtype=float))[:, None]
    lats = vlat + r[None, :] * np.cos(b) / 111320
    lons = vlon + r[None, :] * np.sin(b) / (111320 * math.cos(math.radians(vlat)))
    h = dem.h(lats, lons) - r[None, :] ** 2 / (2 * R_EARTH) * 0.87  # earth curvature with refraction
    return np.degrees(np.arctan2(h - eye, r[None, :]))


def band_max(ang, r, bands):
    out = np.full((3, ang.shape[0]), -30.0)
    for k, (lo, hi) in enumerate(bands):
        m = (r >= lo) & (r < hi)
        if m.any():
            out[k] = ang[:, m].max(axis=1)
    return out


R_PEAK = np.concatenate([np.arange(150, 3000, 20), np.arange(3000, 9000, 40), np.arange(9000, 22000, 90)]).astype(float)
R_LOW = np.concatenate([np.arange(15, 1500, 8), np.arange(1500, 6000, 30), np.arange(6000, 20000, 90)]).astype(float)


def view_angles(centre_az):
    return centre_az + np.linspace(-FOV / 2, FOV / 2, COLS)


def peak_view(dem, vlat, vlon, eye, centre_az, D):
    bands = [(0, 0.62 * D), (0.62 * D, 1.45 * D), (1.45 * D, 1e9)]
    return band_max(rays(dem, vlat, vlon, eye, view_angles(centre_az), R_PEAK), R_PEAK, bands)


def best_peak_view(dem, p):
    """The best of 12 directions x 4 distances around the place; layers (3, 241) + how it was found."""
    lat, lon = p["lat"], p["lon"]
    if p["kind"] in SNAP_KINDS:
        d = np.arange(-120, 121, 30)
        la = lat + d[:, None] / 111320 + np.zeros((1, len(d)))
        lo = lon + d[None, :] / (111320 * math.cos(math.radians(lat))) + np.zeros((len(d), 1))
        hh = dem.h(la, lo)
        iy, ix = np.unravel_index(np.argmax(hh), hh.shape)  # first maximum, row-major
        slat, slon, sh = float(la[iy, ix]), float(lo[iy, ix]), float(hh[iy, ix])
    else:
        slat, slon, sh = lat, lon, dem.h1(lat, lon)
    same = (p["slat"], p["slon"]) == (lat, lon)
    approach = 180.0 if same else bearing(lat, lon, p["slat"], p["slon"])
    best = None
    c = C
    for D in (3500, 6000, 9000, 13000):
        for daz in range(0, 360, 30):
            side = (approach + daz) % 360
            vlat, vlon = offset(slat, slon, side, D)
            eye = dem.h1(vlat, vlon) + 200
            look = (side + 180) % 360
            v = peak_view(dem, vlat, vlon, eye, look, D)
            summit_ang = v[1, c - 2:c + 3].max()
            near_c = v[0, c - 4:c + 5].max()
            far_c = v[2, c - 4:c + 5].max()
            q = COLS // 4
            mid = v[1, q:-q]
            edge = np.median(np.concatenate([mid[:20], mid[-20:]]))
            prom = summit_ang - edge
            hidden = max(near_c, far_c) - summit_ang
            e = COLS // 8 * 3
            centre = np.maximum(v[1, e:-e], np.maximum(v[0, e:-e], v[2, e:-e]))
            peak_is_top = summit_ang >= centre.max() - 0.2
            prom = 0.5 * prom + 0.5 * (summit_ang - np.median(np.concatenate([centre[:8], centre[-8:]])))
            f = (D / 3500) ** 0.8  # angles shrink with distance; judge the shape, not the size
            score = f * prom - 3 * f * max(hidden + 0.3 / f, 0) + (1.0 if peak_is_top else -2.0)
            score -= min(daz, 360 - daz) / 180.0  # prefer the side the trail comes from
            if best is None or score > best[0]:
                best = (float(score), D, look, v)
    score, D, look, v = best
    return dict(layers=v, D=D, look=round(look), score=round(score, 2), h=round(sh))


def best_low_view(dem, p):
    """Standing at the place (a lake: on its near shore): the look direction with the highest skyline."""
    lat, lon = p["lat"], p["lon"]
    approach = bearing(lat, lon, p["slat"], p["slon"])
    c = C
    vlat, vlon = offset(lat, lon, approach, 120) if p["kind"] == "pleso" else (lat, lon)
    eye = dem.h1(vlat, vlon) + (3 if p["kind"] == "roklina" else 2)
    bands = [(60, 700), (700, 3000), (3000, 1e9)]
    away = (approach + 180) % 360
    best = None
    for look in range(0, 360, 15):
        v = band_max(rays(dem, vlat, vlon, eye, view_angles(look), R_LOW), R_LOW, bands)
        sky = v.max(axis=0)
        dev = min(abs(look - away), 360 - abs(look - away))
        q = COLS // 8
        if p["kind"] == "roklina":
            walls = (sky[c - 4 * q:c - 2 * q].mean() + sky[c + 2 * q:c + 4 * q].mean()) / 2
            score = (walls - sky[c - q // 2:c + q // 2].mean()) - dev / 120
        else:
            score = sky[c - 2 * q:c + 2 * q].mean() + 0.5 * (sky[c - 2:c + 3].max() - sky[c - 2 * q:c + 2 * q].min()) - dev / 90
        if best is None or score > best[0]:
            best = (float(score), look, v)
    score, look, v = best
    return dict(layers=v, D=0, look=round(look), score=round(score, 2), h=round(dem.h1(lat, lon)))


# ---------------------------------------------------------------- packing

def dp_keep(x, y, tol):
    """Indices kept by Douglas-Peucker on the polyline (x, y); the ends always stay."""
    n = len(x)
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        dx, dy = x[b] - x[a], y[b] - y[a]
        seg = x[a + 1:b], y[a + 1:b]
        d = np.abs(dy * (seg[0] - x[a]) - dx * (seg[1] - y[a])) / max(math.hypot(dx, dy), 1e-9)
        i = int(np.argmax(d))
        if d[i] > tol:
            m = a + 1 + i
            keep[m] = True
            stack += [(a, m), (m, b)]
    return np.flatnonzero(keep)


def pack_layer(vals, w, ky, tol):
    """One layer as ints: [a0, dx1, da1, dx2, da2, ...]. a = angle in 0.05 degree; vertex k sits at column
    sum(dx); the first vertex is column 0, the last the window's last column."""
    q = np.round(np.asarray(vals, dtype=float) / STEP).astype(int)
    x = np.arange(len(q)) * (w / (len(q) - 1))
    idx = dp_keep(x, q * STEP * ky, tol)
    out = [int(q[idx[0]])]
    for a, b in zip(idx[:-1], idx[1:]):
        out += [int(b - a), int(q[b] - q[a])]
    return out


def pack_window(layers, which):
    cfg = WINDOWS[which]
    cut = np.asarray(layers)[:, cfg["first"]:cfg["first"] + cfg["n"]]
    return [pack_layer(row, cfg["w"], cfg["ky"], cfg["tol"]) for row in cut]


def unpack_layer(packed, n):
    """Inverse of pack_layer, to n columns of degrees (linear between the vertices)."""
    cols, angs = [0], [packed[0]]
    for i in range(1, len(packed), 2):
        cols.append(cols[-1] + packed[i])
        angs.append(angs[-1] + packed[i + 1])
    return np.interp(np.arange(n), cols, angs) * STEP


# ---------------------------------------------------------------- places

def compute_place(p, dem=None):
    """Packed windows for one place: {k, lat, lon, a, d, look, card, banner}."""
    peak = p["kind"] in PEAK_KINDS
    if dem is None:
        dem = Dem(p["lat"], p["lon"], 32000 if peak else 22000)
    r = best_peak_view(dem, p) if peak else best_low_view(dem, p)
    return dict(k=p["kind"], lat=p["lat"], lon=p["lon"], a=ALGO, d=r["D"], look=r["look"],
                card=pack_window(r["layers"], "card"), banner=pack_window(r["layers"], "banner"))


def pick_places(trips, photos):
    """Places without a photo: the main trip (not a variant, highest rank) per destination, plus every trip slug
    of those places. Keyed by the OSM id as photos.json is ("trip/<slug>" for hand-made trips)."""
    best, slugs = {}, {}
    for t in trips:
        d = t["destination"]
        pid = d.get("osm") or f"trip/{t['slug']}"
        slugs.setdefault(pid, []).append(t["slug"])
        if t.get("variant_of"):
            continue
        if pid not in best or t.get("rank", 0) > best[pid][1].get("rank", 0):
            best[pid] = (pid, t)
    places = []
    for pid, t in sorted(best.items(), key=lambda kv: kv[0]):
        t = t[1]
        if pid in photos:
            continue
        d = t["destination"]
        places.append(dict(id=pid, name=d["name"], kind=d.get("kind", "ine"), lat=d["location"]["lat"], lon=d["location"]["lon"],
                           slat=t["start"]["location"]["lat"], slon=t["start"]["location"]["lon"], slug=t["slug"], slugs=slugs[pid]))
    return places


def cards_file(full, places):
    """The small static file: card windows only, and each trip slug -> its place."""
    ids = {p["id"] for p in places if p["id"] in full}
    return dict(
        v=FORMAT,
        places={i: [KINDS.index(full[i]["k"]), *full[i]["card"]] for i in sorted(ids)},
        trips={s: p["id"] for p in places if p["id"] in ids for s in p["slugs"]},
    )


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma separated place names (a sample run; nothing else is dropped)")
    ap.add_argument("--limit", type=int, help="at most this many new places")
    ap.add_argument("--out", help="folder for terrain.json and terrain-cards.json instead of data/ and public/data/")
    args = ap.parse_args(argv)
    full_path = Path(args.out) / "terrain.json" if args.out else OUT_FULL
    cards_path = Path(args.out) / "terrain-cards.json" if args.out else OUT_CARDS

    trips = json.loads(INDEX.read_text())["trips"]
    photos = json.loads(PHOTOS.read_text()).get("photos", {}) if PHOTOS.exists() else {}
    places = pick_places(trips, photos)
    sample = bool(args.only or args.limit)
    if args.only:
        wanted = {n.strip() for n in args.only.split(",")}
        places = [p for p in places if p["name"] in wanted]
    old = json.loads(full_path.read_text()).get("places", {}) if full_path.exists() else {}
    full = {}
    todo = []
    for p in places:
        o = old.get(p["id"])
        if o and o.get("a") == ALGO and o["lat"] == p["lat"] and o["lon"] == p["lon"] and o["k"] == p["kind"]:
            full[p["id"]] = o
        else:
            todo.append(p)
    if args.limit:
        todo = todo[: args.limit]
    log(f"{len(places)} places without a photo, {len(full)} kept from the last run, {len(todo)} to compute")
    # Neighbouring places share tiles: go in map order so the decoded-tile cache is hit.
    todo.sort(key=lambda p: (round(p["lat"], 1), p["lon"]))
    failed = 0
    t0 = time.time()
    for n, p in enumerate(todo, 1):
        try:
            full[p["id"]] = compute_place(p)
        except TileError as e:
            failed += 1
            log(f"skipped {p['name']} ({p['id']}): {e}")
        if n % 50 == 0 or n == len(todo):
            log(f"{n}/{len(todo)} in {time.time() - t0:.0f} s")
    if todo:
        log(f"computed {len(todo) - failed} places in {time.time() - t0:.1f} s ({(time.time() - t0) / len(todo):.2f} s each)")
    if sample:
        full = {**{i: o for i, o in old.items()}, **full}  # a sample run keeps everything else as it was
        shown = pick_places(trips, photos)
    else:
        shown = places
    if todo and failed > 0.25 * len(todo):
        log("more than a quarter of the places failed: writing nothing")
        return 1
    dump(full_path, dict(v=FORMAT, places={i: full[i] for i in sorted(full)}))
    cards = cards_file(full, shown)
    dump(cards_path, cards)
    raw = len(cards_path.read_bytes())
    log(f"{len(cards['places'])} places, {len(cards['trips'])} trips, terrain-cards.json {raw} bytes, terrain.json {len(full_path.read_bytes())} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
