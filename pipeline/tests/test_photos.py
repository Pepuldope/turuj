"""Photo matching and credit lines for the town pages (pipeline/photos.py)."""

import re

from pipeline import photos
from pipeline.photos import GENERIC, credit, names_place, plain


def words(name):
    return [w for w in re.findall(r"[a-z]{4,}", plain(name)) if w not in GENERIC]


def test_a_title_must_name_the_place_not_a_stem_of_it():
    assert not names_place(words("Holý vŕšok"), "Catholic church - Važec.jpg")
    assert not names_place(words("Slop"), "Unnamed road, 919 54 Dobrá Voda, Slovakia.jpg")
    assert names_place(words("Čachtický hrad"), "Čachtický hrad 2.jpg")
    assert names_place(words("Kamzík"), "Pohľad na Kamzíka.jpg")
    assert names_place(words("Rozhľadňa na Tlstej hore"), "Rozhladna Tlsta hora.jpg")


def test_a_view_from_the_place_is_not_a_photo_of_it():
    assert not names_place(words("Tatárska lúka"), "Sitno z Tatárskej lúky.jpg")
    assert not names_place(words("Zámčisko"), "Pohľad na Modru zo Zámčiska.jpg")


def test_credit_lines_name_the_author():
    asked = {"Artist": {"value": "This image is a work by Mercy. When reusing, please credit me as: Mercy from Wikimedia Commons"}}
    assert credit(asked) == "Mercy from Wikimedia Commons"
    assert credit({"Artist": {"value": "I would appreciate being notified if you use my work outside Wikimedia. More of"}}) == ""
    assert credit({"Artist": {"value": '<a href="//commons.wikimedia.org/wiki/User:X">Jerzy Opioła</a>'}}) == "Jerzy Opioła"
    assert credit({"Attribution": {"value": "Photo: Jane Doe"}, "Artist": {"value": "jdoe"}}) == "Photo: Jane Doe"
    long = credit({"Artist": {"value": "word " * 40}})
    assert len(long) <= 101 and long.endswith("…") and not long[:-1].endswith(" ")


def test_mapillary_drops_sequences_shot_from_a_vehicle():
    from pipeline.photos import from_a_vehicle

    def shot(seq, ms, lon):
        return {"sequence": seq, "captured_at": ms, "geometry": {"coordinates": [lon, 48.0]}}

    # ~37 m in 2 s (~67 km/h) is a car; ~4 m in 5 s is someone walking.
    car = [shot("car", 1_600_000_000_000, 17.0), shot("car", 1_600_000_002_000, 17.0005)]
    walk = [shot("walk", 1_600_000_000_000, 17.0), shot("walk", 1_600_000_005_000, 17.00005)]
    assert from_a_vehicle(car + walk) == {"car"}


def test_slovak_and_latin_animal_names_are_off_topic():
    # Peter 15 Nov 2026: a nuthatch was Šarišský hrad's photo.
    assert photos.OFF_TOPIC.search("Brhlík lesný Sitta europaea na smrekovci v NPR Šarišský hradný vrch, 689.jpg")
    assert photos.OFF_TOPIC.search("Vtáky na Sitne.jpg")
    # Places named after animals stay.
    for title in ["Sokolie-masiv.jpg", "Vlkolínec 06.jpg", "Medvedia hora.jpg", "Sovia skala.jpg", "Šarišský hrad 21 Slovakia.jpg"]:
        assert not photos.OFF_TOPIC.search(title), title


def test_place_matched_photos_skip_wells_sketches_maps_and_crowds():
    # 15 Nov 2026 sweep: these were photos of peaks, caves and huts.
    for title in ["Prameň v k.ú. Omšenie, wgs84 48.91332N 18.2131E.jpg", "Mojtínska jaskyňa náčrt.png", "Relief Map of Slovakia 2.png",
                  "Sledging today in Jahodná resort, Kosice, Slovakia (25248285968).jpg", "20260815 02 Dechtice-Svätodušnica pouť.jpg",
                  "Uhrovec, Jankov vŕšok, hotel Partizán.jpg"]:
        assert photos.NOT_OUTDOORS.search(title), title
    assert not photos.NOT_OUTDOORS.search("Šariš Castle Keep 2024.jpg")


def test_automatic_matches_wait_until_checked():
    # Peter, 2026-11-21: Revín's blocked street photo was replaced by the next street photo by itself.
    info = {
        "Bellova 09.jpg": {"url": "u1", "page": "https://commons.wikimedia.org/wiki/File:Bellova_09.jpg", "cats": ""},
        "Revín vrchol.jpg": {"url": "u2", "page": "https://commons.wikimedia.org/wiki/File:Rev%C3%ADn_vrchol.jpg", "cats": ""},
    }
    cands = [("Bellova_09.jpg", "area"), ("Revín vrchol.jpg", "near")]
    photo, held = photos.choose(cands, info, checked=set())
    assert photo is None and held == [("Bellova 09.jpg", "area"), ("Revín vrchol.jpg", "near")]
    photo, held = photos.choose(cands, info, checked={"Revín vrchol.jpg"})
    assert photo["url"] == "u2" and photo["via"] == "near" and held == [("Bellova 09.jpg", "area")]
    # A photo someone chose (Wikidata, Wikipedia, a hand pick) needs no look.
    photo, held = photos.choose([("Bellova 09.jpg", "wikidata")], info, checked=set())
    assert photo["via"] == "wikidata" and held == []
    assert photos.file_of(info["Revín vrchol.jpg"]) == "Revín vrchol.jpg"


def test_masts_statues_and_memorials_are_not_a_view():
    for title in ("Vidlica vysielač - panoramio.jpg", "Socha, kopec Ryboňov.jpg", "Pamätník padlým.jpg"):
        assert photos.NOT_A_VIEW.search(title), title
    assert not photos.NOT_A_VIEW.search("Sochová dolina.jpg")
