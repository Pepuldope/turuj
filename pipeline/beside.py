"""Trail signs beside the walker: a pavement along a marked road takes that road's marking.

OpenStreetMap puts a hiking route on the line of the road or track it follows. Where a pavement,
a cycle path or a second track is mapped next to it, the walker is on a way that belongs to no
route, and the page said "no marking" for a stretch where the signs stand a few metres away
(2026-11-26: 49 of the 60 routes with a wrong stretch of 80 m or more). Two ways to end up there:
the marked way is a main road the trip builder never walks (osm.WALK_HIGHWAYS has no primary or
secondary), or the pavement was simply the cheaper way.

The walked line does not change. A step with no trail colour takes the colour of a marked way that
runs beside it: at most BESIDE_M away and in the same direction within BESIDE_DEG, for at least
BESIDE_MIN_M in a row. The last rule keeps out a path that leaves a trail at a flat angle (its
first metres are still close to the trail) and every crossing.

A pavement that carries a route without a trail colour of its own counts too (Via Slovakia or a
pilgrim route on the pavement, the coloured trail on the road 5 m away: Selec, Stará Ľubovňa,
Devínska Nová Ves; about 40 routes on 2026-11-27).
"""

import math

import numpy as np
from scipy.spatial import cKDTree

BESIDE_M = 15.0  # a pavement is at most this far from the line of its road
BESIDE_DEG = 30.0  # and runs the same way within this angle
BESIDE_MIN_M = 50.0  # a shorter stretch is a fork or a crossing, not a pavement
STEP_SHARE = 0.8  # this much of one step has to be beside the marked way
LINE_SAMPLE_M = 6.0  # marked ways are kept as points this far apart
STEP_SAMPLE_M = 10.0  # a walked step is tested at points this far apart
NEIGHBOURS = 16  # marked points looked at around each tested point (about three ways side by side)


def _samples(xy, spacing):
    """Points along a line of (n, 2) metres, at most `spacing` apart and never on a vertex.

    Returns (points, piece): `piece[k]` is the index of the straight piece point k lies on.
    """
    seg = np.diff(xy, axis=0)
    n = np.maximum(1, np.ceil(np.hypot(seg[:, 0], seg[:, 1]) / spacing)).astype(int)
    piece = np.repeat(np.arange(len(seg)), n)
    k = np.arange(len(piece)) - np.repeat(np.cumsum(n) - n, n)
    u = (k + 0.5) / n[piece]
    return xy[:-1][piece] + seg[piece] * u[:, None], piece


def _units(xy):
    """Unit direction of each straight piece of a line; (0, 0) for a piece without length."""
    seg = np.diff(xy, axis=0)
    length = np.hypot(seg[:, 0], seg[:, 1])
    return seg / np.where(length > 0, length, 1.0)[:, None], length


class MarkedLines:
    """Every way that carries a coloured hiking route, to ask which marking runs beside a walk."""

    def __init__(self, lines, proj):
        """`lines`: (lats, lons, colour) per marked way; `proj`: geo.LocalProjection."""
        self.proj = proj
        self.colours = []
        pts, dirs, cols = [], [], []
        for lats, lons, colour in lines:
            if not colour or len(lats) < 2:
                continue
            xy = proj.xy(lats, lons)
            p, piece = _samples(xy, LINE_SAMPLE_M)
            unit, length = _units(xy)
            keep = length[piece] > 0
            if not keep.any():
                continue
            if colour not in self.colours:
                self.colours.append(colour)
            pts.append(p[keep])
            dirs.append(unit[piece][keep])
            cols.append(np.full(int(keep.sum()), self.colours.index(colour), np.int16))
        self.xy = np.concatenate(pts) if pts else np.zeros((0, 2))
        self.dir = np.concatenate(dirs).astype(np.float32) if dirs else np.zeros((0, 2), np.float32)
        self.col = np.concatenate(cols) if cols else np.zeros(0, np.int16)
        self.tree = cKDTree(self.xy) if len(self.xy) else None

    def fill(self, lat, lon, colours):
        """The step colours of a walked line with the marking beside it filled in.

        `colours[i]` is the marking of the step from point i to point i + 1, None for none. Steps
        that have a marking keep it.
        """
        out = list(colours)
        todo = np.array([i for i, c in enumerate(out) if c is None], dtype=int)
        if self.tree is None or not len(todo):
            return out
        xy = self.proj.xy(lat, lon)
        unit, length = _units(xy)
        # test points on the unmarked steps only
        ends = np.stack([xy[todo], xy[todo + 1]], axis=1)  # (steps, 2 ends, xy)
        seg = ends[:, 1] - ends[:, 0]
        n = np.maximum(1, np.ceil(length[todo] / STEP_SAMPLE_M)).astype(int)
        step = np.repeat(np.arange(len(todo)), n)
        k = np.arange(len(step)) - np.repeat(np.cumsum(n) - n, n)
        pts = ends[step, 0] + seg[step] * ((k + 0.5) / n[step])[:, None]

        d, j = self.tree.query(pts, k=min(NEIGHBOURS, len(self.xy)), distance_upper_bound=BESIDE_M)
        d, j = d.reshape(len(pts), -1), j.reshape(len(pts), -1)
        near = np.isfinite(d)
        if not near.any():
            return out
        j = np.where(near, j, 0)
        u = unit[todo][step]
        cos = np.abs(u[:, None, 0] * self.dir[j, 0] + u[:, None, 1] * self.dir[j, 1])
        d = np.where(near & (cos >= math.cos(math.radians(BESIDE_DEG))), d, np.inf)
        best = d.argmin(axis=1)  # the nearest marked way that runs the same way
        rows = np.arange(len(pts))
        found = np.isfinite(d[rows, best])
        if not found.any():
            return out
        votes = np.zeros((len(todo), len(self.colours)), int)
        np.add.at(votes, (step[found], self.col[j[rows, best]][found]), 1)
        beside = votes.sum(axis=1) >= STEP_SHARE * n
        pick = votes.argmax(axis=1)

        # only stretches of BESIDE_MIN_M or more in a row count
        a = 0
        while a < len(todo):
            if not beside[a]:
                a += 1
                continue
            b = a
            while b + 1 < len(todo) and beside[b + 1] and todo[b + 1] == todo[b] + 1:
                b += 1
            if length[todo[a : b + 1]].sum() >= BESIDE_MIN_M:
                for s in range(a, b + 1):
                    out[int(todo[s])] = self.colours[int(pick[s])]
            a = b + 1
        return out
