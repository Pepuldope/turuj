"""A pavement beside a marked road takes the road's trail colour; forks, crossings and far paths do not."""

import json
import shutil
from pathlib import Path

import numpy as np
import pytest
import yaml

from pipeline import osm as osm_mod
from pipeline import run
from pipeline.beside import MarkedLines
from pipeline.geo import LocalProjection

ROOT = Path(__file__).resolve().parents[2]
PROJ = LocalProjection()
LAT0, LON0 = 48.8, 19.0


def ll(points):
    """Metres east and north of a fixed corner -> (lats, lons)."""
    p = np.asarray(points, float)
    return LAT0 + p[:, 1] / PROJ.ky, LON0 + p[:, 0] / PROJ.kx


def marked(*lines):
    """MarkedLines from (colour, [(x, y), ...]) in metres."""
    return MarkedLines([(*ll(pts), colour) for colour, pts in lines], PROJ)


def walk(m, points, colours=None):
    lat, lon = ll(points)
    return m.fill(lat, lon, colours or [None] * (len(points) - 1))


ROAD = ("red", [(0, 0), (300, 0), (600, 40)])  # a marked road with a bend


def test_a_pavement_beside_a_marked_road_takes_its_colour():
    # 8 m to the side of the road, round the same bend
    pavement = [(0, 8), (100, 8), (200, 8), (299, 8), (450, 28), (598, 48)]
    assert walk(marked(ROAD), pavement) == ["red"] * 5


def test_a_path_that_crosses_the_trail_stays_unmarked():
    assert walk(marked(ROAD), [(150, -120), (150, -40), (150, 40), (150, 120)]) == [None] * 3


def test_a_path_that_leaves_the_trail_at_a_flat_angle_stays_unmarked():
    # 25 degrees off the trail: its first 35 m are within 15 m of it, the rest is not
    fork = [(100 + d * 0.906, d * 0.423) for d in range(0, 201, 10)]
    assert walk(marked(ROAD), fork) == [None] * 20


def test_a_path_far_from_the_trail_stays_unmarked():
    assert walk(marked(ROAD), [(0, 30), (100, 30), (200, 30), (300, 30)]) == [None] * 3


def test_a_short_stretch_beside_the_trail_stays_unmarked():
    # 40 m beside the road, between two stretches that run away from it
    path = [(100, 80), (100, 8), (140, 8), (140, 80)]
    assert walk(marked(ROAD), path) == [None] * 3


def test_marked_steps_keep_their_colour_and_only_the_pavement_part_is_filled():
    # blue trail down to the road, 200 m of pavement, then away from the road
    path = [(0, 100), (0, 8), (100, 8), (200, 8), (200, 100)]
    assert walk(marked(ROAD), path, ["blue", None, None, None]) == ["blue", "red", "red", None]


def test_the_nearer_of_two_marked_ways_wins():
    m = marked(("red", [(0, 0), (300, 0)]), ("blue", [(0, 20), (300, 20)]))
    assert walk(m, [(0, 6), (150, 6), (300, 6)]) == ["red", "red"]
    assert walk(m, [(0, 13), (150, 13), (300, 13)]) == ["blue", "blue"]


def test_no_marked_ways_at_all():
    assert walk(MarkedLines([], PROJ), [(0, 0), (100, 0)]) == [None]


# ------------------------------------------------------------- whole build --
M_LAT, M_LON = 1 / 111_320, 1 / 74_220  # one metre in degrees at 48.19 N


def osm_xml(pilgrim_route=False):
    """A village street that carries the red trail but is a main road (no trip walks its line), a
    pavement 8 m beside it for 500 m, then the red path up to a peak. With pilgrim_route the
    pavement carries a long-distance route that has no trail colour (Via Slovakia at Selec)."""
    nodes, ways = [], []

    def node(i, east, north, **tags):
        t = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
        nodes.append(f'<node id="{i}" version="1" lat="{48.19 + north * M_LAT:.7f}" lon="{17.082 + east * M_LON:.7f}">{t}</node>')

    for k in range(7):  # road, west to east
        node(100 + k, 100 * k, 0)
    for k in range(6):  # pavement; it joins the road's last point
        node(200 + k, 100 * k, 8)
    for k in range(1, 9):  # the path up, north-east
        node(300 + k, 600 + 90 * k, 90 * k)
    node(1, 2, 9, tourism="information", information="guidepost", name="Dedina, námestie")
    node(2, -20, 20, amenity="parking", name="Parkovisko pri kostole")
    node(4, 1325, 722, natural="peak", name="Chodníkový vrch", ele="500")
    node(7, 0, -4000, place="town", name="Testovo", population="5000")
    nd = lambda ids: "".join(f'<nd ref="{i}"/>' for i in ids)
    ways.append(f'<way id="1000" version="1">{nd(range(100, 107))}<tag k="highway" v="secondary"/></way>')
    ways.append(f'<way id="1001" version="1">{nd([*range(200, 206), 106])}<tag k="highway" v="footway"/>'
                '<tag k="footway" v="sidewalk"/></way>')
    ways.append(f'<way id="1002" version="1">{nd([106, *range(301, 309)])}<tag k="highway" v="path"/></way>')
    rel = ('<relation id="5000" version="1"><member type="way" ref="1000" role=""/><member type="way" ref="1002" role=""/>'
           '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="ref" v="0801"/>'
           '<tag k="osmc:symbol" v="red:white:red_bar"/></relation>')
    if pilgrim_route:
        rel += ('\n<relation id="5001" version="1"><member type="way" ref="1001" role=""/>'
                '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="name" v="Via Skúška"/></relation>')
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="test">\n'
            + "\n".join(sorted(nodes, key=lambda x: int(x.split('"')[1])) + ways + [rel]) + "\n</osm>\n")


@pytest.mark.parametrize("pilgrim_route", [False, True])
def test_the_whole_build_colours_the_pavement(tmp_path, pilgrim_route):
    (tmp_path / "pipeline").mkdir()
    (tmp_path / "data").mkdir()
    cfg = yaml.safe_load((ROOT / "pipeline" / "config.yaml").read_text())
    cfg["pinned"] = [dict(slug="chodnikovy-pin", name="Chodníkový vrch z dediny", kind="vrchol",
                          start=dict(name="Dedina, námestie", lat=48.19 + 8 * M_LAT, lon=17.082),
                          destination=dict(name="Chodníkový vrch", lat=48.19 + 720 * M_LAT, lon=17.082 + 1320 * M_LON))]
    (tmp_path / "pipeline" / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True))
    (tmp_path / "pipeline" / "overrides.yaml").write_text("trips: {}\ndrop: []\n")
    for f in ("closure-rules.json", "fee-rules.json"):
        shutil.copy(ROOT / "data" / f, tmp_path / "data" / f)
    pbf = tmp_path / "test.osm"
    pbf.write_text(osm_xml(pilgrim_route))

    # the main road is no way to walk, but its marking is kept
    data = osm_mod.load(str(pbf), [b for r in cfg["regions"] for b in r["bboxes"]])
    assert [w.id for w in data.ways] == [1001, 1002]
    assert len(data.marked_lines) == 1 and len(data.marked_lines[0][0]) == 7

    assert run.main(["--pbf", str(pbf), "--root", str(tmp_path)]) == 0
    trip = json.loads((tmp_path / "public" / "data" / "trips" / "chodnikovy-pin.json").read_text())
    # 600 m of pavement and 1 km of path: red signs all the way, one run
    assert trip["marking"] == ["red"]
    assert trip["marking_runs"] == [{"from": 0, "to": trip["turnaround_index"], "colour": "red"}]
    assert 1500 < trip["distance_m"] / 2 < 1700
    # the share of ways walked that belong to a route is what it was (the checks that drop a route read it)
    assert trip["marked_share"] == 1 if pilgrim_route else 0.5 < trip["marked_share"] < 0.75
