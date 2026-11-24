"""Small geometry helpers. Coordinates are (lat, lon) unless a name says otherwise."""

import math
import re
import unicodedata

import numpy as np

EARTH_R = 6371008.8


def haversine(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres. Works on scalars and numpy arrays."""
    la1, lo1, la2, lo2 = (np.radians(x) for x in (lat1, lon1, lat2, lon2))
    h = np.sin((la2 - la1) / 2) ** 2 + np.cos(la1) * np.cos(la2) * np.sin((lo2 - lo1) / 2) ** 2
    return 2 * EARTH_R * np.arcsin(np.sqrt(h))


class LocalProjection:
    """Equirectangular projection to metres, accurate enough within Slovakia."""

    def __init__(self, lat0=48.8):
        self.kx = EARTH_R * math.pi / 180 * math.cos(math.radians(lat0))
        self.ky = EARTH_R * math.pi / 180

    def xy(self, lat, lon):
        return np.column_stack([np.asarray(lon, float) * self.kx, np.asarray(lat, float) * self.ky])


def colour_runs(keep, colours, last):
    """The path points to store and the trail-marking runs over them.

    `colours[i]` is the marking of the step from point i to point i + 1 (None = no marking), `keep`
    the points left after simplifying the line, `last` the final point of the stored path. A
    simplified piece spans many steps and used to take the colour of its first one: a 300 m straight
    piece that began with a 10 m unmarked crossing was stored as 300 m without marking, and a marked
    stretch inside one piece was lost (Peter, 2026-11-24: red, blue, red on the trail, one sign change
    on the page, to "no marking"). Every point where the marking changes is kept, so a piece has one colour.

    Returns (points, runs): the kept point indices, sorted, and [{from, to, colour}] over positions in them.
    """
    last = int(last)
    breaks = {i for i in range(1, min(last, len(colours))) if colours[i] != colours[i - 1]}
    pts = sorted({int(i) for i in keep if i <= last} | breaks | {0, last})
    runs = []
    for j in range(len(pts) - 1):
        c = colours[pts[j]]
        if runs and runs[-1]["colour"] == c:
            runs[-1]["to"] = j + 1
        else:
            runs.append({"from": j, "to": j + 1, "colour": c})
    return pts, runs


def rdp_indices(xy, tol):
    """Ramer-Douglas-Peucker on an (n, 2) array of metres; returns kept indices, sorted."""
    n = len(xy)
    if n <= 2:
        return list(range(n))
    keep = np.zeros(n, bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        p, q = xy[a], xy[b]
        seg = q - p
        L = math.hypot(*seg)
        pts = xy[a + 1 : b]
        if L == 0:
            d = np.hypot(*(pts - p).T)
        else:
            d = np.abs(seg[0] * (pts[:, 1] - p[1]) - seg[1] * (pts[:, 0] - p[0])) / L
        i = int(np.argmax(d))
        if d[i] > tol:
            m = a + 1 + i
            keep[m] = True
            stack += [(a, m), (m, b)]
    return list(np.nonzero(keep)[0])


def resample(lats, lons, step=20.0):
    """Points every `step` metres along a polyline (always includes both ends)."""
    lats = np.asarray(lats, float)
    lons = np.asarray(lons, float)
    if len(lats) < 2:
        return lats, lons, np.zeros(len(lats))
    seg = haversine(lats[:-1], lons[:-1], lats[1:], lons[1:])
    cum = np.concatenate([[0], np.cumsum(seg)])
    total = cum[-1]
    if total == 0:
        return lats[:1], lons[:1], np.zeros(1)
    t = np.append(np.arange(0, total, step), total)
    return np.interp(t, cum, lats), np.interp(t, cum, lons), t


def ascent_descent(ele, threshold=5.0):
    """Total climb and descent with a hysteresis filter that ignores DEM noise below `threshold` m."""
    ele = [e for e in ele if e is not None and not math.isnan(e)]
    if len(ele) < 2:
        return 0.0, 0.0
    up = down = 0.0
    ref = ele[0]
    for e in ele[1:]:
        if e - ref >= threshold:
            up += e - ref
            ref = e
        elif ref - e >= threshold:
            down += ref - e
            ref = e
    return up, down


def din33466_minutes(dist_m, up_m, down_m):
    """Hiking time without breaks (DIN 33466): 4 km/h, 300 m/h up, 500 m/h down."""
    horiz = dist_m / 4000
    vert = up_m / 300 + down_m / 500
    return (max(horiz, vert) + min(horiz, vert) / 2) * 60


def round_up_15(minutes):
    return int(math.ceil(minutes / 15 - 1e-9) * 15)


# Letters NFKD does not decompose: Slovak ones, and the Polish ł that border peaks carry ("Wołowiec" -> "wolowiec").
_SK = str.maketrans({"ä": "a", "ô": "o", "ľ": "l", "ĺ": "l", "ŕ": "r", "ł": "l", "đ": "d", "ø": "o", "ß": "ss",
                     "æ": "ae", "œ": "oe"})


def slugify(text, max_len=48):
    """'Štrbské Pleso' -> 'strbske-pleso'."""
    t = text.lower().translate(_SK)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    if len(t) > max_len:
        t = t[:max_len].rsplit("-", 1)[0]
    return t or "trasa"
