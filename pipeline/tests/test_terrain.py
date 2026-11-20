"""Terrain skylines (pipeline/terrain.py) on a synthetic elevation model: no network."""

import numpy as np

from pipeline import terrain
from pipeline.terrain import C, WINDOWS, Dem, compute_place, pack_layer, pick_places, unpack_layer

LAT, LON = 48.9, 19.5
SIZE = 11  # tiles per side
M_PER_PX = 40075016.686 * np.cos(np.radians(LAT)) / (2 ** 12 * 256)


def make_dem(height):
    """A synthetic DEM centred on (LAT, LON): height(east_m, north_m) -> metres."""
    x, y = terrain.tile_xy(LAT, LON)
    tx0, ty0 = int(x) - SIZE // 2, int(y) - SIZE // 2
    n = SIZE * 256
    px = (np.arange(n) + tx0 * 256 - x * 256) * M_PER_PX  # east, metres from the place
    py = -(np.arange(n) + ty0 * 256 - y * 256) * M_PER_PX  # north
    east, north = np.meshgrid(px, py)
    return Dem.from_array(height(east, north).astype(np.float32), tx0, ty0)


def place(kind, slat=LAT - 0.02, slon=LON):
    return dict(id="node/1", name="T", kind=kind, lat=LAT, lon=LON, slat=slat, slon=slon, slug="t", slugs=["t"])


def cone(east, north):
    # Steep and pointy, so that from 3.5 km out nothing nearer hides the summit.
    return np.clip(1000 * (1 - np.hypot(east, north) / 2500), 0, None)


def test_a_cone_has_its_summit_centred_and_highest():
    for kind in ("vrchol", "hrad", "chata"):
        r = compute_place(place(kind), make_dem(cone))
        for which, focus in (("card", 77), ("banner", 96)):
            n = WINDOWS[which]["n"]
            layers = [unpack_layer(l, n) for l in r[which]]
            sky = np.max(layers, axis=0)
            top = int(np.argmax(layers[1]))
            assert abs(top - focus) <= 3, (kind, which, top)
            # the summit is the highest point of the whole window, within the packing's tolerance
            assert layers[1][focus - 3:focus + 4].max() >= sky.max() - 0.15


def test_the_card_and_banner_windows_cut_the_same_view():
    # Column 77 of the card window and column 96 of the banner window are both column 120 (C) of the view.
    assert WINDOWS["card"]["first"] + 77 == C == WINDOWS["banner"]["first"] + 96
    assert WINDOWS["card"]["n"] == 103 and WINDOWS["banner"]["n"] == 193


def test_a_gorge_looks_along_the_valley_with_walls_either_side():
    # A valley running north-south: walls rise east and west. The start is south, so the view looks north.
    def valley(east, north):
        return np.clip(0.5 * np.abs(east), 0, 900)

    r = compute_place(place("roklina"), make_dem(valley))
    assert r["look"] in (345, 0, 15)
    layers = np.max([unpack_layer(l, 193) for l in r["banner"]], axis=0)
    middle, sides = layers[88:105].mean(), (layers[10:40].mean() + layers[153:183].mean()) / 2
    assert sides > middle + 3  # walls high at the sides, low where the gorge runs on


def test_a_lake_is_seen_from_its_near_shore_with_ground_rising_behind():
    def slope(east, north):
        return np.clip(0.2 * east, 0, 700)

    r = compute_place(place("pleso", slat=LAT, slon=LON - 0.02), make_dem(slope))
    assert r["look"] in (75, 90, 105)
    sky = np.max([unpack_layer(l, 193) for l in r["banner"]], axis=0)
    assert sky.min() > -5  # the land stands all round the view, none of it open sky


def test_packing_keeps_the_ends_and_stays_within_a_pixel():
    rng = np.random.default_rng(1)
    vals = np.cumsum(rng.normal(0, 0.15, 103)) + 3
    w, ky, tol = 96.0, 4.5, 0.3
    packed = pack_layer(vals, w, ky, tol)
    back = unpack_layer(packed, 103)
    assert len(back) == 103
    assert abs(back[0] - vals[0]) <= 0.026 and abs(back[-1] - vals[-1]) <= 0.026
    assert np.max(np.abs(back - vals)) * ky <= tol + 0.3  # tolerance plus quantising
    assert len(packed) < 2 * 103


def test_it_is_deterministic():
    a = compute_place(place("vodopad"), make_dem(cone))
    b = compute_place(place("vodopad"), make_dem(cone))
    assert a == b


def test_places_without_a_photo_one_per_destination_with_all_their_slugs():
    def trip(slug, osm, rank, variant=None):
        t = dict(slug=slug, rank=rank, destination=dict(name=slug, kind="vrchol", osm=osm, location=dict(lat=48.1, lon=19.1)),
                 start=dict(location=dict(lat=48.0, lon=19.0)))
        if variant:
            t["variant_of"] = variant
        return t

    trips = [trip("a", "node/1", 10), trip("a-od-auta", "node/1", 90, "a"), trip("b", "node/2", 5), trip("c", "node/3", 7)]
    got = pick_places(trips, {"node/3": {}})
    assert [p["id"] for p in got] == ["node/1", "node/2"]
    assert got[0]["slug"] == "a" and got[0]["slugs"] == ["a", "a-od-auta"]  # a variant is never the main trip
    full = {"node/1": dict(k="vrchol", card=[[0], [0], [0]]), "node/2": dict(k="ine", card=[[1], [1], [1]])}
    cards = terrain.cards_file(full, got)
    assert cards["places"]["node/2"][0] == terrain.KINDS.index("ine")
    assert cards["trips"] == {"a": "node/1", "a-od-auta": "node/1", "b": "node/2"}
