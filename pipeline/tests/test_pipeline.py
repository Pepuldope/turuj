"""End-to-end run on a tiny hand-made OSM file, plus unit checks of the helpers."""

import json
import re
import shutil
from pathlib import Path

import numpy as np
import yaml

from pipeline import packed, run
from pipeline.geo import ascent_descent, din33466_minutes, rdp_indices, round_up_15, slugify
from pipeline.osm import kst_colour
from pipeline.rules import RuleMatcher

ROOT = Path(__file__).resolve().parents[2]


def osm_xml(two_routes=False):
    """A guidepost with parking and a bus stop, a red-marked path up to a peak, a one-way gorge loop
    (and with two_routes, a second peak reached from two starts)."""
    nodes, ways = [], []

    def node(i, lat, lon, **tags):
        t = "".join(f'<tag k="{k.replace("_", ":")}" v="{v}"/>' for k, v in tags.items())
        nodes.append(f'<node id="{i}" version="1" lat="{lat}" lon="{lon}">{t}</node>')

    # main trail: 10 nodes from (48.190, 17.082) to (48.182, 17.093)
    for k in range(10):
        node(100 + k, 48.190 - 0.0009 * k, 17.082 + 0.0012 * k)
    node(1, 48.19001, 17.08201, tourism="information", information="guidepost", name="Dolná studnička")
    node(2, 48.1903, 17.0815, amenity="parking", fee="no", name="Parkovisko pod lesom")
    node(3, 48.1905, 17.0822, highway="bus_stop", name="Studnička")
    node(4, 48.18195, 17.09305, natural="peak", name="Testovací vrch", ele="440", wikipedia="sk:Testovací vrch")
    node(5, 48.1860, 17.0875, tourism="viewpoint", name="Vyhliadka")
    node(6, 48.1855, 17.0880, natural="spring", name="Studnička pod vrchom")
    node(7, 48.15, 17.11, place="town", name="Testovo", population="5000")
    # a buffet ~400 m off the trail, up a side path from its 6th node
    node(150, 48.1855, 17.0908)
    node(8, 48.1855, 17.0935, amenity="restaurant", name="Bufet Test")
    ways.append('<way id="1001" version="1"><nd ref="105"/><nd ref="150"/><nd ref="8"/><tag k="highway" v="path"/></way>')
    # a café 170 m off the trail on no way at all (just over the 150 m of "on the walk")
    node(9, 48.18832, 17.08734, amenity="cafe", name="Kaviareň na skale")
    # gorge loop in the Slovenský raj box: start guidepost -> one-way gorge up -> waterfall, back by a forest track
    for k in range(6):
        node(200 + k, 48.930 + 0.002 * k, 20.300)
    for k in range(1, 5):
        node(300 + k, 48.930 + 0.002 * k, 20.303)
    node(11, 48.93001, 20.30001, tourism="information", information="guidepost", name="Podlesok")
    node(12, 48.9302, 20.2995, amenity="parking", fee="yes")
    node(13, 48.9400, 20.30005, waterway="waterfall", name="Závojový vodopád")

    # a peak with two routes: a quiet start with a small car park, and a known one (big car park, bus, food)
    for k in range(10 if two_routes else 0):
        node(600 + k, 49.190 + 0.001 * k, 19.040 + 0.001 * k)
        node(700 + k, 49.212 - 0.0012 * k, 19.062 - 0.0012 * k)
    if two_routes:
        node(21, 49.19001, 19.04001, tourism="information", information="guidepost", name="Dolina", ele="500")
        node(22, 49.1902, 19.0398, amenity="parking")
        node(23, 49.21201, 19.06201, tourism="information", information="guidepost", name="Sedlo", ele="550")
        node(24, 49.2122, 19.0622, amenity="parking", capacity="150")
        node(25, 49.2121, 19.0619, highway="bus_stop", name="Sedlo, rázcestie")
        node(26, 49.2119, 19.0623, amenity="restaurant", name="Koliba pod sedlom")
        node(27, 49.2001, 19.0501, natural="peak", name="Druhý vrch", ele="900", wikipedia="sk:Druhý vrch")
        # a castle on a hill: a marked trail up from the village, and a car park right by the walls
        for k in range(12):
            node(900 + k, 49.280 + 0.0016 * k, 19.280 + 0.0016 * k)
        node(31, 49.29921, 19.29921, historic="castle", name="Hrad Skúška", ele="650", wikipedia="sk:Hrad Skúška")
        node(32, 49.28001, 19.28001, tourism="information", information="guidepost", name="Podhradie", ele="300")
        node(33, 49.2801, 19.2795, amenity="parking", capacity="60")
        node(34, 49.3010, 19.2990, amenity="parking", name="Parkovisko pod hradom")
        node(35, 49.3005, 19.2992)
        # from Sedlo a second marked way, round the south side of the hill
        for k, (la, lo) in enumerate([(49.2095, 19.0640), (49.2068, 19.0648), (49.2042, 19.0630),
                                      (49.2022, 19.0590), (49.2008, 19.0545)]):
            node(800 + k, la, lo)

        ways.append(('<way id="3000" version="1">' + "".join(f'<nd ref="{600 + k}"/>' for k in range(10))
                     + '<nd ref="27"/><tag k="highway" v="path"/></way>'))
        ways.append(('<way id="3001" version="1">' + "".join(f'<nd ref="{700 + k}"/>' for k in range(10))
                     + '<nd ref="27"/><tag k="highway" v="path"/></way>'))
        ways.append(('<way id="3003" version="1">' + "".join(f'<nd ref="{900 + k}"/>' for k in range(12))
                     + '<nd ref="31"/><tag k="highway" v="path"/></way>'))
        ways.append('<way id="3004" version="1"><nd ref="34"/><nd ref="35"/><nd ref="31"/><tag k="highway" v="footway"/></way>')
        ways.append(('<way id="3002" version="1"><nd ref="700"/>' + "".join(f'<nd ref="{800 + k}"/>' for k in range(5))
                     + '<nd ref="27"/><tag k="highway" v="path"/></way>'))
    ways.append(('<way id="1000" version="1">' + "".join(f'<nd ref="{100 + k}"/>' for k in range(10))
                 + '<tag k="highway" v="path"/><tag k="sac_scale" v="mountain_hiking"/></way>'))
    ways.append(('<way id="2000" version="1">' + "".join(f'<nd ref="{200 + k}"/>' for k in range(6))
                 + '<tag k="highway" v="path"/><tag k="oneway" v="yes"/><tag k="ladder" v="yes"/></way>'))
    ways.append(('<way id="2001" version="1"><nd ref="205"/>' + "".join(f'<nd ref="{300 + k}"/>' for k in range(4, 0, -1))
                 + '<nd ref="200"/><tag k="highway" v="track"/></way>'))
    rels = [
        '<relation id="5000" version="1"><member type="way" ref="1000" role=""/>'
        '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="ref" v="0801"/>'
        '<tag k="osmc:symbol" v="red:white:red_bar"/></relation>',
        '<relation id="5001" version="1"><member type="way" ref="2000" role=""/><member type="way" ref="2001" role=""/>'
        '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="ref" v="8888"/>'
        '<tag k="osmc:symbol" v="green:white:green_bar"/></relation>',
    ] + ([
        '<relation id="5002" version="1"><member type="way" ref="3000" role=""/>'
        '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="osmc:symbol" v="blue:white:blue_bar"/></relation>',
        '<relation id="5003" version="1"><member type="way" ref="3001" role=""/>'
        '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="osmc:symbol" v="yellow:white:yellow_bar"/></relation>',
        '<relation id="5005" version="1"><member type="way" ref="3003" role=""/>'
        '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="osmc:symbol" v="red:white:red_bar"/></relation>',
        '<relation id="5004" version="1"><member type="way" ref="3002" role=""/>'
        '<tag k="type" v="route"/><tag k="route" v="hiking"/><tag k="osmc:symbol" v="green:white:green_bar"/></relation>',
    ] if two_routes else [])
    key = lambda x: int(re.search(r'id="(\d+)"', x).group(1))
    nodes.sort(key=key)
    ways.sort(key=key)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="test">\n'
            + "\n".join(nodes + ways + rels) + "\n</osm>\n")


def make_root(tmp_path):
    (tmp_path / "pipeline").mkdir()
    (tmp_path / "data").mkdir()
    cfg = yaml.safe_load((ROOT / "pipeline" / "config.yaml").read_text())
    cfg["pinned"] = [dict(slug="testovaci-pin", name="Testovací vrch z Dolnej studničky", kind="vrchol",
                          start=dict(name="Dolná studnička", lat=48.190, lon=17.082),
                          destination=dict(name="Testovací vrch", lat=48.1819, lon=17.0930),
                          expect=dict(distance_m=2600, ascent_m=0, duration_min=45))]
    (tmp_path / "pipeline" / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True))
    (tmp_path / "pipeline" / "overrides.yaml").write_text("trips: {}\ndrop: []\n")
    for f in ("closure-rules.json", "fee-rules.json"):
        shutil.copy(ROOT / "data" / f, tmp_path / "data" / f)
    pbf = tmp_path / "test.osm"
    pbf.write_text(osm_xml(two_routes=True))
    return pbf


def test_end_to_end(tmp_path):
    pbf = make_root(tmp_path)
    assert run.main(["--pbf", str(pbf), "--root", str(tmp_path)]) == 0
    index = json.loads((tmp_path / "public" / "data" / "trips" / "index.json").read_text())
    by_slug = {t["slug"]: t for t in index["trips"]}
    assert len(by_slug) == len(index["trips"])  # slugs are unique
    # the pinned trip is built and the generated trip to the same peak is deduplicated
    assert "testovaci-pin" in by_slug
    assert not any(t["destination"]["name"] == "Testovací vrch" and not t["curated"] for t in index["trips"])
    pin = by_slug["testovaci-pin"]
    assert pin["parking"]["name"] == "Parkovisko pod lesom" and pin["parking"]["fee"] is False
    assert pin["transit"]["name"] == "Studnička" and pin["transit"]["mode"] == "autobus"
    assert pin["marking"] == ["red"] and pin["route"] == "tam-a-spat"
    assert 2000 < pin["distance_m"] < 3000
    # on the walk: no detour; the buffet up the side path: a short side trip there and back
    pois = {p["name"]: p for p in json.loads((tmp_path / "public" / "data" / "trips" / "testovaci-pin.json").read_text())["pois"]}
    assert "detour_min" not in pois["Vyhliadka"]
    assert pois["Bufet Test"]["kind"] == "obcerstvenie" and 10 <= pois["Bufet Test"]["detour_min"] <= 15
    assert 5 <= pois["Kaviareň na skale"]["detour_min"] <= 10
    # Food places carry their pictogram: a "bufet" by name even when tagged a restaurant.
    assert pois["Bufet Test"]["food"] == "bufet" and pois["Kaviareň na skale"]["food"] == "kaviaren"
    assert "food" not in pois["Vyhliadka"]

    # the gorge is one-way, so the waterfall trip is a loop with the ladder fee rule
    falls = next(t for t in index["trips"] if t["destination"]["name"] == "Závojový vodopád")
    assert falls["route"] == "okruh" and falls["region"] == "slovensky-raj"
    assert any(f["rule_id"] == "slovensky-raj-rebriky" for f in falls["fees"])
    assert falls["parking"]["fee"] is True

    detail = json.loads((tmp_path / "public" / "data" / "trips" / f"{falls['slug']}.json").read_text())
    assert detail["path"][0][:2] == detail["path"][-1][:2]  # loop ends where it started
    assert 0 < detail["turnaround_index"] < len(detail["path"]) - 1
    assert (tmp_path / "public" / "gpx" / f"{falls['slug']}.gpx").exists()
    # two routes to one peak: the known start is the main trip, the other is a variant of it
    variants = json.loads((tmp_path / "data" / "trip-variants.json").read_text())["trips"]
    assert variants and not any(t.get("variant_of") for t in index["trips"])  # the site's index: main routes only
    peak = [t for t in index["trips"] + variants if t["destination"]["name"] == "Druhý vrch"]
    assert len(peak) == 3
    main = next(t for t in peak if not t.get("variant_of"))
    other = next(t for t in peak if t.get("variant_of") and t["start"]["name"] == "Dolina")
    # another way up from the main start: round the south side, a slug of its own, a word of its own
    alt = next(t for t in peak if t.get("variant_of") and t["start"]["name"] == "Sedlo")
    assert main["start"]["name"] == "Sedlo" and main["route_label"] == "Hlavná cesta" and main["route_count"] == 3
    assert other["variant_of"] == main["slug"] and other["route_label"]
    assert other["rank"] == main["rank"] and other["slug"] != main["slug"]
    assert alt["slug"].endswith("-ina-cesta") and alt["variant_of"] == main["slug"] and alt["marking"] == ["green"]
    assert len({t["route_label"] for t in peak}) == 3
    # one GPX per place: the main route's track first, each route's track tagged with its slug
    assert not (tmp_path / "public" / "gpx" / f"{other['slug']}.gpx").exists()
    assert main["gpx_url"] == f"/gpx/{main['slug']}.gpx" and other["gpx_url"] == f"/gpx/{main['slug']}.gpx#{other['slug']}"
    gpx = (tmp_path / "public" / "gpx" / f"{main['slug']}.gpx").read_text()
    assert gpx.count("<trk>") == 3 and gpx.index(f"<desc>{main['slug']}</desc>") < gpx.index(f"<desc>{other['slug']}</desc>")
    # the castle: the car park by the walls is the main route (a castle people drive to), the hike from the village another
    castle = [t for t in index["trips"] + variants if t["destination"]["name"] == "Hrad Skúška"]
    c_main = next(t for t in castle if not t.get("variant_of"))
    hike = next(t for t in castle if t.get("variant_of"))
    assert c_main["start"]["name"] == "Parkovisko pod hradom" and c_main["duration_min"] <= 45
    assert c_main["parking"]["name"] == "Parkovisko pod hradom"
    assert hike["start"]["name"] == "Podhradie" and hike["duration_min"] >= 60 and hike["variant_of"] == c_main["slug"]
    assert not any(t.get("route_label") == "Krátko od auta" for t in castle)
    # each route's file lists all of them, main first, with its way up, so the trip page reads only that file
    for t in (main, other, alt):
        routes = json.loads((tmp_path / "public" / "data" / "trips" / f"{t['slug']}.json").read_text())["routes"]
        assert routes[0]["slug"] == main["slug"] and {r["slug"] for r in routes} == {main["slug"], other["slug"], alt["slug"]}
        assert routes[0]["start_name"] == "Sedlo" and all(len(r["up"]) >= 2 for r in routes)
    mains = [t["slug"] for t in index["trips"] if not t.get("variant_of")]

    # the home list: every place once, without the text it never shows
    listed = json.loads((tmp_path / "public" / "data" / "trips" / "list.json").read_text())["trips"]
    assert [t["slug"] for t in listed] == mains
    assert "description" not in listed[0] and "osm" not in listed[0]["start"]
    report = (tmp_path / "data" / "pipeline-report.md").read_text()
    assert "testovaci-pin" in report
    # map lines: every trip once in the overview, in detail in the cells it crosses
    mdir = tmp_path / "public" / "data" / "map"
    meta = json.loads((mdir / "meta.json").read_text())
    overview = packed.read_features(mdir / "overview.json")
    assert sorted(f["properties"]["s"] for f in overview) == sorted(mains)
    assert meta["cells"] and all((mdir / "c" / f"{k}.json").exists() for k in meta["cells"])
    in_cells = {f["properties"]["s"] for k in meta["cells"] for f in packed.read_features(mdir / "c" / f"{k}.json")}
    assert in_cells == set(mains)

    # slugs are stable: a second run reuses them
    slugs_before = json.loads((tmp_path / "pipeline" / "slugs.json").read_text())
    assert run.main(["--pbf", str(pbf), "--root", str(tmp_path)]) == 0
    assert json.loads((tmp_path / "pipeline" / "slugs.json").read_text()) == slugs_before


def test_route_labels_are_unique_per_place():
    from pipeline.trips import TripBuilder

    goal = dict(lat=48.20, lon=17.00)

    def r(slug, start, dur, at=(48.19, 17.00), up=300, transit=None):
        return dict(slug=slug, start=dict(name=start, osm=start, location=dict(lat=at[0], lon=at[1])),
                    destination=dict(location=goal), duration_min=dur, ascent_m=up, transit=transit)

    main = r("m", "Devín", 90)
    # two shorter routes: the shortest is "Kratšia", the other says which side it comes from
    routes = [r("a", "Dúbravka", 45, (48.21, 17.00)), r("b", "Mariánka", 50, (48.21, 17.01)),
              r("c", "Devín", 150), r("d", "Lamač", 95, (48.20, 17.02)), r("e", "Devín", 100)]
    TripBuilder.assign_labels(main, routes, {})
    labels = {x["slug"]: x["route_label"] for x in routes}
    assert labels == {"a": "Kratšia", "b": "Zo severu", "c": "Dlhšia", "d": "Z východu", "e": "Iným chodníkom"}
    routes = [r("a", "X", 95), r("b", "Y", 96), r("c", "Z", 97)]
    TripBuilder.assign_labels(main, routes, {"a": "Pajštún", "b": "Pajštún"})
    assert [x["route_label"] for x in routes] == ["Cez Pajštún", "Z juhu", "Iná cesta"]


def test_helpers():
    assert slugify("Štrbské Pleso") == "strbske-pleso"
    assert slugify("Ďumbier, Chopok – hrebeň") == "dumbier-chopok-hreben"
    assert kst_colour({"osmc:symbol": "red:white:red_bar"}) == "red"
    assert kst_colour({"osmc:symbol": "white::yellow_bar"}) == "yellow"
    assert kst_colour({"colour": "Blue"}) == "blue"
    up, down = ascent_descent([100, 102, 101, 110, 120, 118, 119, 100], 5)
    assert (up, down) == (20, 20)
    assert round_up_15(din33466_minutes(4000, 0, 0)) == 60
    assert round_up_15(din33466_minutes(4000, 300, 300)) == 135  # 1.6 h + 0.5 h = 126 min
    xy = np.array([[0, 0], [1, 0.1], [2, 0], [3, 5], [4, 0]], float)
    assert rdp_indices(xy, 1.0) == [0, 2, 3, 4]


def test_closure_probe():
    rules = [dict(id="probe", selector=dict(bbox=[19.4, 49.05, 20.45, 49.33], probes=["Kriváň", "Nikde"]))]
    m = RuleMatcher(rules, {"Kriváň": [(49.16235, 19.99987)]})
    lats = np.linspace(49.12, 49.1622, 50)
    lons = np.linspace(20.06, 19.9999, 50)
    assert m.match(lats, lons, set(), set()) == ["probe"]
    assert m.match(lats[:20], lons[:20], set(), set()) == []
    assert m.unresolved == {"probe": ["Nikde"]}


def test_closure_section(tmp_path):
    """A closed stretch of a marked route between two named places (the TANAP sections)."""
    from pipeline import osm as osm_mod
    from pipeline.graph import Graph
    from pipeline.rules import section_keys

    rules = [dict(id="usek", selector=dict(bbox=[17.0, 48.1, 17.2, 48.3], sections=[
        dict(ref="0801", **{"from": ["Neznáma", "dolna studnicka"], "to": "Testovací vrch"})])),
        dict(id="chyba", selector=dict(sections=[dict(ref="0801", **{"from": "Dolná studnička", "to": "Inde"}),
                                                 dict(ref="9999", **{"from": "Dolná studnička", "to": "Testovací vrch"})]))]
    f = tmp_path / "t.osm"
    f.write_text(osm_xml())
    osm = osm_mod.load(str(f), [[17.0, 48.1, 17.2, 48.3]], name_keys=section_keys(rules))
    m = RuleMatcher(rules, osm.probes, Graph(osm), osm.named, osm.guideposts)
    assert [label for label, _ in m.sections["usek"]] == ["0801 Neznáma / dolna studnicka – Testovací vrch"]
    assert 1000 < m.sections["usek"][0][1] < 1500
    assert len(m.unresolved["chyba"]) == 2 and "not found" in m.unresolved["chyba"][0]
    lats, lons = np.linspace(48.190, 48.182, 60), np.linspace(17.082, 17.093, 60)
    assert m.match(lats, lons, set(), set()) == ["usek"]
    # 300 m on the stretch is a shared start, not the closed walk; a goal in the middle of it is
    assert m.match(lats[:15], lons[:15], set(), set()) == []
    assert m.match(lats[:15], lons[:15], set(), set(), (48.186, 17.0875)) == ["usek"]


def test_closure_goal_exception(tmp_path):
    """TANAP keeps the yellow to Baranec open as far as Plačlivé, a summit on the closed ridge: a trip
    to that goal coming up the open way stays open; the same goal from elsewhere, or another goal, closes."""
    from pipeline import osm as osm_mod
    from pipeline.graph import Graph
    from pipeline.rules import section_keys

    sec = dict(ref="0801", **{"from": "Dolná studnička", "to": "Testovací vrch"})
    rules = [dict(id="usek", selector=dict(sections=[sec], goal_exceptions=[
        dict(goal="Vyhliadka", via=dict(ref="0801", **{"from": "Dolná studnička", "to": "Vyhliadka"}))]))]
    f = tmp_path / "t.osm"
    f.write_text(osm_xml())
    osm = osm_mod.load(str(f), [[17.0, 48.1, 17.2, 48.3]], name_keys=section_keys(rules))
    m = RuleMatcher(rules, osm.probes, Graph(osm), osm.named, osm.guideposts)
    assert not m.unresolved
    lats, lons = np.linspace(48.190, 48.182, 60), np.linspace(17.082, 17.093, 60)
    goal = (48.186, 17.0875)
    assert m.match(lats[:15], lons[:15], set(), set(), goal, "Vyhliadka") == []
    assert m.match(lats[:15], lons[:15], set(), set(), goal, "Iný vrch") == ["usek"]
    # walking the closed stretch itself still closes, exception or not
    assert m.match(lats, lons, set(), set(), goal, "Vyhliadka") == ["usek"]


def test_elevation_tags_that_are_not_numbers():
    from pipeline.trips import _num

    assert _num("2654,5") == 2654.5 and _num("2654m") == 2654.0
    assert _num("nan") is None and _num("inf") is None and _num("?") is None and _num(None) is None


def test_walks_stop_when_osrm_is_down():
    import pytest

    from pipeline import walks

    path = [[19.0, 49.0, 500], [19.01, 49.0, 520], [19.02, 49.0, 540]]
    trip = {"slug": "t", "path": path, "route": "okruh", "start": {"location": {"lat": 49.0, "lon": 19.0}},
            "parking": {"location": {"lat": 49.01, "lon": 19.0}, "walk_m": 1200}}
    with pytest.raises(RuntimeError):
        walks.add("http://127.0.0.1:9", [trip], log=lambda *_: None)
