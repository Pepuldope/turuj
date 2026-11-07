"""Start labels, slugs, the description template, slug redirects, include list and relation goals."""

from pipeline import osm as osm_mod
from pipeline import redirects
from pipeline.geo import slugify
from pipeline.osm import Feature
from pipeline.trips import TripBuilder, is_junction_name, start_label


def f(name, mode=None, **tags):
    t = dict(tags)
    if mode:
        t["_mode"] = mode
    return Feature("node/1", name, 49.0, 20.0, t)


def test_junction_names():
    for n in ["Odbočka pri Heliose", "Rázcestie Šindľovec", "Rázc. Gola", "Hradište pod Vrátnom, rázc.",
              "Slavošovce, odbočka do Zlatnej doliny", "Suchý vrch, odb. na vyhliadku", "Vyhliadka 8 min.",
              "Dva stromy 35'", "", None]:
        assert is_junction_name(n), n
    for n in ["Podlesok", "Pod Štartom", "Dobroč", "Biely potok", "Popradské pleso"]:
        assert not is_junction_name(n), n


def test_start_label_from_parking_stop_or_place():
    places = [(300.0, f("Štrbské Pleso", place="village"))]
    # a named car park wins when it is the nearest
    assert start_label([(120.0, f("Parkovisko Štrbské Pleso"))], [], places) == "Parkovisko Štrbské Pleso"
    assert start_label([(120.0, f("Pri Heliose"))], [], places) == "Pri Heliose, parkovisko"
    # an unnamed car park is no label; the stop within 150 m is
    assert start_label([(50.0, f(None))], [(100.0, f("Štrbské Pleso, žel. st.", "vlak"))], places) == "Štrbské Pleso, žel. st."
    assert start_label([], [(100.0, f("Popradské Pleso", "vlak"))], places) == "Popradské Pleso, stanica"
    # a stop 400 m away is too far; the village is the label
    assert start_label([], [(400.0, f("Rázcestie, bus", "autobus"))], places) == "Štrbské Pleso"
    # nothing near: the nearest place, whatever the distance up to 5 km, with "okolie"
    far = [(2500.0, f("Tokaríny", place="hamlet"))]
    assert start_label([], [], far) == "Tokaríny, okolie"
    assert start_label([], [], []) == "Turistický chodník"
    # a junction-named place or stop never becomes the label
    assert start_label([], [(10.0, f("Odbočka na Hradisko", "autobus"))], []) == "Turistický chodník"


def test_slugify_polish_letters():
    assert slugify("Wołowiec") == "wolowiec"
    assert slugify("Volovec / Wołowiec") == "volovec-wolowiec"
    assert slugify("Štrbské Pleso") == "strbske-pleso"


def test_describe_keeps_the_loop_out_of_the_start_name():
    dest = dict(name="Banská Bystrica", kind="hrad", ele=None)

    class St:
        name = "Banská Bystrica, parkovisko"

    d = TripBuilder._describe(dest, St, ["red"], True)
    assert "Štart: Banská Bystrica, parkovisko (okruh)." in d
    assert "parkovisko, okruh" not in d
    assert "Štart: Banská Bystrica, parkovisko, späť rovnakou cestou." in TripBuilder._describe(dest, St, [], False)


def test_redirects_rename_retire_and_never_dangle():
    prev = {"volovec-woowiec": None, "volovec-woowiec-x": "volovec-woowiec", "cave": None, "cave-od-auta": "cave",
            "gone": None, "gone-v": "gone"}
    live = {"volovec-zapadne-tatry", "volovec-zapadne-tatry-x", "cave", "other"}
    renames = {"volovec-woowiec": "volovec-zapadne-tatry", "volovec-woowiec-x": "volovec-zapadne-tatry-x"}
    t = redirects.update({"older": "volovec-woowiec", "dead": "nowhere", "cave": "other"}, prev, live, renames)
    assert t["volovec-woowiec"] == "volovec-zapadne-tatry"
    assert t["volovec-woowiec-x"] == "volovec-zapadne-tatry-x"
    assert t["older"] == "volovec-zapadne-tatry"  # chains collapse
    assert t["cave-od-auta"] == "cave"  # a retired variant goes to its place
    assert "gone" not in t and "gone-v" not in t and "dead" not in t  # no live target, no redirect
    assert "cave" not in t  # a live slug never redirects
    assert all(v in live for v in t.values())


def test_apply_renames_moves_variants_too():
    slugs = {"a": "volovec-woowiec", "v|a|b": "volovec-woowiec-razcestie-zverovka", "c": "volovec-woowiecx", "d": "x"}
    redirects.apply_renames(slugs, {"volovec-woowiec": "volovec-zapadne-tatry"})
    assert slugs == {"a": "volovec-zapadne-tatry", "v|a|b": "volovec-zapadne-tatry-razcestie-zverovka",
                     "c": "volovec-woowiecx", "d": "x"}


OSM = """<?xml version='1.0' encoding='UTF-8'?>
<osm version="0.6">
 <node id="1" version="1" lat="49.100" lon="19.100"/>
 <node id="2" version="1" lat="49.100" lon="19.102"/>
 <node id="3" version="1" lat="49.102" lon="19.102"/>
 <node id="4" version="1" lat="49.102" lon="19.100"/>
 <way id="10" version="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/></way>
 <relation id="20" version="1"><member type="way" ref="10" role="outer"/>
  <tag k="type" v="multipolygon"/><tag k="historic" v="castle"/><tag k="name" v="Hrad Skúška"/></relation>
 <node id="5" version="1" lat="49.2" lon="19.2"><tag k="tourism" v="hotel"/><tag k="name" v="Dom Skúška"/></node>
</osm>
"""


def test_relation_goals_and_include_list(tmp_path):
    p = tmp_path / "t.osm"
    p.write_text(OSM)
    data = osm_mod.load(str(p), [[19.0, 49.0, 19.5, 49.5]], border_relation=None, include=[{"osm": "node/5", "kind": "chata"}])
    castle = [f for k, f in data.destinations if k == "hrad"]
    assert [c.osm for c in castle] == ["relation/20"]
    assert abs(castle[0].lat - 49.1008) < 0.01 and abs(castle[0].lon - 19.1008) < 0.01
    assert "node/5" in data.included and data.included["node/5"].name == "Dom Skúška"
    assert not any(f.osm == "node/5" for _, f in data.destinations)  # a hotel is no goal by its tags
