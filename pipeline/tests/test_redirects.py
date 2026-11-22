"""Old trip addresses that still lead somewhere (pipeline/redirects.py)."""

from pipeline import redirects


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

