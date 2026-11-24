"""The walk from each parking spot and stop to the trail, on paths, from a local OSRM (foot profile).

The trip page draws this walk and used to ask OpenRouteService for it on every
visit (free key: 40 routes a minute). The walk is the same for everyone, so it
is worked out here once a week and stored on the parking or stop itself:

    "walk": {"line": [[lon, lat], ...], "m": 420, "min": 6}

It ends where the site joins the trail (lib/trailJoin.ts, ported below): the
trail's nearest point when that saves at least 100 m, else the trail start.

The nearest point is not always the best way in. A bus stop beside the road
can be 500 m from the start as the crow flies yet 1.2 km on paths, while a
path from the stop climbs straight up to the trail further on (Vilmošove
vodopády from Kačínska dolina). So for there-and-back trips the walk is also
measured (OSRM table) to points along the first half of the way up, and it
goes to the one that makes the whole way up clearly shorter. The site then
joins the trail where the stored walk first meets it (lib/trailJoin.ts).
"""

import json
import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from .geo import LocalProjection, haversine, rdp_indices
from .trips import approach_min, fit_walk_cap

# lib/trailJoin.ts MIN_SAVING_M: joining part-way must save this much walking, or the start it is.
MIN_SAVING_M = 100
# components/TripMap.tsx AT_TRAIL_M: closer than this, there is no walk to draw.
AT_TRAIL_M = 60
# Fewer points with the shape kept (as /api/drive draws the road).
SHAPE_TOL_M = 2
# A "walk" over this is a wrong snap, not the way in (/api/walk refuses past 5 km too).
MAX_WALK_M = 5000
# A way in further up the trail must shorten the whole way up (walk + trail) by this much.
SHORTCUT_SAVING_M = 200
# Points tried along the trail: this far apart, and only on the first half of the way up
# (the trip stays a trip, not a stroll from a stop beside the goal).
SHORTCUT_STEP_M = 120
SHORTCUT_MAX_SHARE = 0.5
# ...and at least this share of the trail it skips (no 4 km walk to skip 4.5 km of trail).
SHORTCUT_MIN_RATIO = 0.25
# ...and the walk may be at most this much longer than the usual one: a stop or car park on the
# wrong side of the start, not a 4 km walk on other paths instead of the marked trail.
SHORTCUT_MAX_EXTRA_M = 500
# lib/trailJoin.ts TOUCH_M: the walk must end this close to the trail for the site to join there.
TOUCH_M = 25


def _nearest_on_path(path, lat, lon):
    """lib/geo.ts nearestOnPath: (segment i, t, point (lat, lon), metres) of the closest point."""
    kx = 111320 * math.cos(math.radians(lat))
    ky = 110540
    best = (0, 0.0, (path[0][1], path[0][0]), float(haversine(path[0][1], path[0][0], lat, lon)))
    for i in range(len(path) - 1):
        ax, ay = (path[i][0] - lon) * kx, (path[i][1] - lat) * ky
        bx, by = (path[i + 1][0] - lon) * kx, (path[i + 1][1] - lat) * ky
        dx, dy = bx - ax, by - ay
        len2 = dx * dx + dy * dy
        t = min(1.0, max(0.0, -(ax * dx + ay * dy) / len2)) if len2 > 0 else 0.0
        d = math.hypot(ax + t * dx, ay + t * dy)
        if d < best[3] - 1e-9:
            a, b = path[i], path[i + 1]
            best = (i, t, (a[1] + t * (b[1] - a[1]), a[0] + t * (b[0] - a[0])), d)
    return best


def join_point(path, place, walk_m, start):
    """Where the walk from `place` meets the trail, as the site works it out: (lat, lon)."""
    start = (start["lat"], start["lon"])
    if len(path) < 2:
        return start
    i, t, point, d = _nearest_on_path(path, place["lat"], place["lon"])
    if (i == 0 and t == 0) or d > walk_m - MIN_SAVING_M:
        return start
    return (round(point[0], 6), round(point[1], 6))


def _simplify(coords):
    """[[lon, lat], ...] with points closer than SHAPE_TOL_M to the line dropped, 5 decimals (~1 m)."""
    if len(coords) <= 2:
        return [[round(x, 5), round(y, 5)] for x, y in coords]
    lon, lat = np.asarray(coords, float).T
    keep = rdp_indices(LocalProjection(float(lat.mean())).xy(lat, lon), SHAPE_TOL_M)
    return [[round(coords[k][0], 5), round(coords[k][1], 5)] for k in keep]


def _m(a, b):
    """Metres between two (lat, lon)."""
    return float(haversine(a[0], a[1], b[0], b[1]))


def candidates(path, upto_index):
    """(along metres, (lat, lon)) every SHORTCUT_STEP_M on the first SHORTCUT_MAX_SHARE of path[:upto_index + 1]."""
    pts = [(p[1], p[0]) for p in path[: upto_index + 1]]
    total = sum(_m(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    limit = total * SHORTCUT_MAX_SHARE
    out, along, next_at = [], 0.0, SHORTCUT_STEP_M
    for i in range(len(pts) - 1):
        seg = _m(pts[i], pts[i + 1])
        while seg > 0 and next_at <= along + seg and next_at <= limit:
            t = (next_at - along) / seg
            a, b = pts[i], pts[i + 1]
            out.append((next_at, (round(a[0] + t * (b[0] - a[0]), 6), round(a[1] + t * (b[1] - a[1]), 6))))
            next_at += SHORTCUT_STEP_M
        along += seg
    return out


def along_m(path, point):
    """Trail metres from the start to the trail's nearest point to `point` (lat, lon)."""
    i, t, _, _ = _nearest_on_path(path, point[0], point[1])
    pts = [(p[1], p[0]) for p in path]
    m = sum(_m(pts[k], pts[k + 1]) for k in range(i))
    return m + t * _m(pts[i], pts[i + 1]) if i + 1 < len(pts) else m


def table(osrm_url, frm, tos):
    """Metres on paths from (lat, lon) to each of `tos`, None where OSRM finds no way."""
    coords = ";".join(f"{lon},{lat}" for lat, lon in [frm, *tos])
    url = f"{osrm_url.rstrip('/')}/table/v1/foot/{coords}?sources=0&annotations=distance"
    with urllib.request.urlopen(url, timeout=60) as r:
        res = json.loads(r.read())
    if res.get("code") != "Ok":
        return [None] * len(tos)
    return res["distances"][0][1:]


def shortcuts(osrm_url, path, upto_index, frm, to, tries=3):
    """(walk to `to`, that minus the trail before it, [(walk minus trail before p, p), ...]): the points
    further up whose walk from `frm` looks clearly shorter by the OSRM table, best first."""
    cands = [c for c in candidates(path, upto_index) if c[0] > along_m(path, to) + SHORTCUT_STEP_M / 2]
    if not cands:
        return None, None, []
    dist = table(osrm_url, frm, [to, *(p for _, p in cands)])
    if dist[0] is None:
        return None, None, []
    base = dist[0] - along_m(path, to)
    better = sorted((d - along, p) for (along, p), d in zip(cands, dist[1:])
                    if d is not None and d <= MAX_WALK_M and d - along <= base - SHORTCUT_SAVING_M)
    return dist[0], base, [p for _, p in better[:tries]]


def to_first_touch(walk, path):
    """The walk cut where it first reaches the trail (as the site joins it), or None if it never does.
    A walk that follows the trail from the start, cutting its corners, touches it right away."""
    line = walk["line"]
    geo, total = [0.0], 0.0
    for k in range(1, len(line)):
        total += _m((line[k - 1][1], line[k - 1][0]), (line[k][1], line[k][0]))
        geo.append(total)
    for k, (lon, lat) in enumerate(line):
        if _nearest_on_path(path, lat, lon)[3] <= TOUCH_M:
            # Touching at the very first point would leave a one-point "walk" of 0 m (the site
            # can't draw it): keep at least the first stretch.
            k = max(k, 1)
            share = geo[k] / total if total > 0 else 0.0
            return {"line": line[: k + 1], "m": int(round(walk["m"] * share)),
                    "min": max(1, int(round(walk["min"] * share)))}
    return None


def better_walk(osrm_url, path, upto_index, frm, to):
    """A walk joining the trail further up that makes the way up clearly shorter, or None.
    Judged on where it really meets the trail: the saving must be SHORTCUT_SAVING_M and at
    least SHORTCUT_MIN_RATIO of the trail it skips, so a long walk to skip a long trail stays out."""
    plain_m, base, tries = shortcuts(osrm_url, path, upto_index, frm, to)
    for p in tries:
        walk = route(osrm_url, frm, p)
        cut = walk and to_first_touch(walk, path)
        if not cut:
            continue
        end = cut["line"][-1]
        along = along_m(path, (end[1], end[0]))
        skip = along - along_m(path, to)
        saving = base - (cut["m"] - along)
        # lib/trailJoin.ts joins on the walk only from MIN_SAVING_M up the trail.
        if cut["m"] <= plain_m + SHORTCUT_MAX_EXTRA_M and along >= MIN_SAVING_M and skip >= MIN_SAVING_M and saving >= max(SHORTCUT_SAVING_M, SHORTCUT_MIN_RATIO * skip):
            return cut
    return None


def route(osrm_url, frm, to):
    """One walk from (lat, lon) to (lat, lon), or None when OSRM finds none."""
    url = (f"{osrm_url.rstrip('/')}/route/v1/foot/{frm[1]},{frm[0]};{to[1]},{to[0]}"
           "?overview=full&geometries=geojson")
    with urllib.request.urlopen(url, timeout=60) as r:
        res = json.loads(r.read())
    if res.get("code") != "Ok" or not res.get("routes"):
        return None
    best = res["routes"][0]
    line = _simplify(best["geometry"]["coordinates"])
    if best["distance"] > MAX_WALK_M or len(line) < 2:
        return None
    return {"line": line, "m": int(round(best["distance"])),
            "min": max(1, int(round(best["duration"] / 60)))}


def add(osrm_url, trips, log=print, workers=8):
    """Set "walk" on every parking and stop of every trip (in place). Returns how many got one."""
    jobs = {}  # (from, to) -> objects that share that walk
    paths = {}  # (from, to) -> (trip path, index of the goal) to look for a shorter way in along
    for t in trips:
        path = t.get("path") or []
        if not path:
            continue
        places = [t.get("parking"), *t.get("parking_alternatives", []), t.get("transit"), *t.get("transit_alternatives", [])]
        for p in places:
            if not p:
                continue
            p.pop("walk", None)
            loc = p["location"]
            to = join_point(path, loc, p["walk_m"], t["start"]["location"])
            if haversine(loc["lat"], loc["lon"], *to) <= AT_TRAIL_M:
                continue
            # A shorter way in depends on the trip's own trail: trips sharing a start and a stop
            # (two goals from one village) each get theirs.
            own = t.get("route") == "tam-a-spat" and t.get("turnaround_index")
            key = ((loc["lat"], loc["lon"]), to, t.get("slug") if own else None)
            jobs.setdefault(key, []).append(p)
            if own:
                paths[key] = (path, t["turnaround_index"])

    plain = {}  # (from, to) -> the walk there, shared by trips that keep it

    def one(key):
        try:
            if key in paths:
                path, upto = paths[key]
                walk = better_walk(osrm_url, path, upto, key[0], key[1])
                if walk:
                    return key, walk, True
            if key[:2] not in plain:
                plain[key[:2]] = route(osrm_url, key[0], key[1])
            return key, plain[key[:2]], False
        except Exception as err:  # noqa: BLE001 - one bad walk must not stop the weekly run
            log(f"walk {key}: {err}")
            failed.append(key)
            return key, None, False

    failed = []
    done = cut = 0
    with ThreadPoolExecutor(workers) as pool:
        for n, (key, walk, shorter) in enumerate(pool.map(one, list(jobs)), start=1):
            cut += shorter
            if walk:
                for p in jobs[key]:
                    p["walk"] = walk
                done += len(jobs[key])
            if n % 2000 == 0:
                log(f"walks: {n}/{len(jobs)}")
    log(f"walks: {done} parking spots and stops have one ({len(jobs)} distinct); "
        f"{cut} join the trail further up, where that makes the way up at least {SHORTCUT_SAVING_M} m shorter")
    if jobs and len(failed) > len(jobs) / 2:
        # The local OSRM is down or wasn't built: publishing would wipe every walk the site draws.
        raise RuntimeError(f"walks: {len(failed)} of {len(jobs)} failed, is OSRM running at {osrm_url}?")
    return done


def _along(p):
    """The walk in metres along paths when OSRM gave one, else the straight line."""
    w = p.get("walk")
    return w["m"] if w and w.get("m") is not None else p["walk_m"]


def cap(trips, max_minutes, report):
    """The trip page shows trail time plus the walk from the first car park or the stop, both ways. After
    the walks are known (along paths, longer than the straight line), keep that within the place's cap:
    stops that make it too long are dropped; another route (variant) that is too long by car is removed
    (and its main loses it from route_count / route_label); a main route over the cap by car stays and is
    only reported (the drive table already used its first car park). `max_minutes(osm)` gives the cap.
    Appends (slug, what, minutes) to report["walk_cap"] and returns the trips that stay."""
    out = report.setdefault("walk_cap", [])
    mains = {t["slug"]: t for t in trips if not t.get("variant_of")}
    gone = []
    for t in list(trips):
        limit = max_minutes(t["destination"]["osm"])
        had = [t.get("transit"), *(t.get("transit_alternatives") or [])]
        why = fit_walk_cap(t, limit, _along)
        kept = [t.get("transit"), *(t.get("transit_alternatives") or [])]
        dropped = len([s for s in had if s]) - len([s for s in kept if s])
        if dropped:
            out.append((t["slug"], f"{dropped} stops over the cap by bus left out", limit))
        if why == "too long with the walk from the car park":
            mins = t["duration_min"] + 2 * approach_min(_along(t["parking"]))
            if t.get("variant_of"):
                out.append((t["slug"], "route over cap by car, removed", mins))
                gone.append(t)
            else:
                out.append((t["slug"], "main over cap by car", mins))
        elif why:
            if t.get("variant_of"):
                out.append((t["slug"], "no car park and no stop within the cap, removed", limit))
                gone.append(t)
            else:
                out.append((t["slug"], "main over cap by bus (no car park)", limit))
    for t in gone:
        trips.remove(t)
        main = mains.get(t.get("variant_of"))
        if main and main.get("route_count"):
            main["route_count"] -= 1
            if main["route_count"] <= 1:
                main.pop("route_count", None)
                main.pop("route_label", None)
    return trips
