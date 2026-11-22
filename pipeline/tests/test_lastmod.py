"""Change dates per trip: only a changed or new file gets today's date."""

from pipeline import lastmod


def test_unchanged_keeps_date_changed_and_new_get_today_removed_is_dropped():
    dates = {"same": "2026-01-01", "changed": "2026-01-01", "gone": "2026-01-01"}
    before = {"same": "h1", "changed": "h2", "gone": "h3"}
    after = {"same": "h1", "changed": "h2b", "new": "h4"}
    out = lastmod.update(dates, before, after, "2026-11-22")
    assert out == {"changed": "2026-11-22", "new": "2026-11-22", "same": "2026-01-01"}


def test_a_trip_without_a_date_gets_today_even_if_unchanged():
    assert lastmod.update({}, {"a": "h"}, {"a": "h"}, "2026-11-22") == {"a": "2026-11-22"}


def test_snapshot_hashes_trip_files_only(tmp_path):
    d = tmp_path / "public" / "data" / "trips"
    d.mkdir(parents=True)
    (d / "a.json").write_text("1")
    (d / "index.json").write_text("x")
    (d / "list.json").write_text("y")
    before = lastmod.snapshot(tmp_path)
    assert set(before) == {"a"}
    (d / "a.json").write_text("2")
    assert lastmod.snapshot(tmp_path)["a"] != before["a"]


def test_write_and_load_round_trip(tmp_path):
    lastmod.write(tmp_path, {"b": "2026-02-02", "a": "2026-01-01"})
    assert lastmod.load(tmp_path) == {"a": "2026-01-01", "b": "2026-02-02"}
    assert (tmp_path / "data" / "trip-lastmod.json").read_text().endswith("}\n")
