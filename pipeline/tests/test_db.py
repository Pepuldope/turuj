"""The D1 load file: valid SQLite, within D1's statement limit, refills cleanly.
(lib/tripDb.test.ts checks the site reads back exactly what data/ holds.)"""

import sqlite3

from pipeline import db

D1_MAX_STATEMENT = 50_000  # D1 allows 100 KB; see db.MAX_STATEMENT_BYTES


def test_sql_loads_twice_with_foreign_keys_and_matches_the_index():
    sql = db.build_sql()
    con = sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(sql)
    con.executescript(sql)  # the weekly reload drops and refills
    assert con.execute("PRAGMA foreign_key_check").fetchall() == []
    trips = con.execute("SELECT trips FROM data_version").fetchone()[0]
    assert trips == con.execute("SELECT count(*) FROM trip").fetchone()[0] > 0


def test_every_statement_fits_d1():
    for statement in db.build_sql().split(";\n"):
        assert len(statement.encode()) < D1_MAX_STATEMENT


def test_fingerprint_ignores_only_the_version_row():
    rows, version = db.build_rows()
    sql = db.full_sql(rows, version)
    assert db.fingerprint(db.data_body(rows)) in sql.rsplit("INSERT INTO data_version", 1)[1]
    version["generated_at"] = "2099-01-01T00:00:00Z"
    assert db.fingerprint(db.data_body(rows)) in db.full_sql(rows, version)


def _have(con):
    """What the loader asks D1 before a load, answered by SQLite in wrangler's --json shape."""
    con.row_factory = sqlite3.Row
    out = [{"results": [dict(r) for r in con.execute(sql)]} for sql in db.HAVE_QUERIES]
    con.row_factory = None
    return db.have_from_results(out)


def _dump(con):
    return {t: sorted(con.execute(f"SELECT * FROM {t}").fetchall()) for t in db.ORDER}


def test_incremental_load_ends_where_a_full_load_would():
    rows, version = db.build_rows()
    con = sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(db.full_sql(rows, version))

    # Next week: one trip renamed, one gone (with all it had), a stop renamed, one town's drives changed.
    new = {t: list(r) for t, r in rows.items()}
    renamed, gone = new["trip"][0], new["trip"][-1]
    new["trip"][0] = renamed[:2] + ("Nový názov",) + renamed[3:-1] + ("changed",)
    new["trip"] = new["trip"][:-1]
    for t in db.PER_TRIP:
        new[t] = [r for r in new[t] if r[0] != gone[0]]
    new["place"] = [r for r in new["place"] if r[0] // 2 != gone[0]]
    used = {r[1] for r in new["trip_transit_stop"]}
    new["transit_stop"] = [r for r in new["transit_stop"] if r[0] in used]
    new["transit_stop"][0] = new["transit_stop"][0][:1] + ("Iná zastávka",) + new["transit_stop"][0][2:]
    new["fee"] = [r for r in new["fee"] if r[0] in {f for _, f in new["trip_fee"]}]
    new["town_drive"][0] = (new["town_drive"][0][0], "[1]", "[2]")
    version = {**version, "trips": len(new["trip"])}

    sql, written = db.incremental_sql(new, version, _have(con))
    con.executescript(sql)
    assert con.execute("PRAGMA foreign_key_check").fetchall() == []
    assert written < 200

    full = sqlite3.connect(":memory:")
    full.executescript(db.full_sql(new, version))
    assert _dump(con) == _dump(full)


def test_changed_trips_keep_their_places_and_only_gone_trips_delete_theirs():
    # On D1 each deleted place scans every trip (trip.start_id / destination_id have no index):
    # deleting the places of ~550 changed trips read 7.2M rows on 16 Nov 2026, over the free 5M a day.
    rows, version = db.build_rows()
    con = sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(db.full_sql(rows, version))

    new = {t: list(r) for t, r in rows.items()}
    changed = [new["trip"][i] for i in range(0, 40, 2)]
    gone = new["trip"][-1]
    for r in changed:
        i = new["trip"].index(r)
        new["trip"][i] = r[:2] + ("Iný názov",) + r[3:-1] + ("changed",)
    start = next(i for i, r in enumerate(new["place"]) if r[0] == changed[0][0] * 2 + 1)
    new["place"][start] = new["place"][start][:1] + ("Iný štart",) + new["place"][start][2:]
    new["trip"] = [r for r in new["trip"] if r[0] != gone[0]]
    for t in db.PER_TRIP:
        new[t] = [r for r in new[t] if r[0] != gone[0]]
    new["place"] = [r for r in new["place"] if r[0] // 2 != gone[0]]
    version = {**version, "trips": len(new["trip"])}

    sql, _ = db.incremental_sql(new, version, _have(con))
    place_deletes = [s for s in sql.split(";\n") if s.lstrip().startswith("DELETE FROM place ")]
    assert place_deletes == [f"DELETE FROM place WHERE id IN ({gone[0] * 2},{gone[0] * 2 + 1})"]
    con.executescript(sql)
    assert con.execute("PRAGMA foreign_key_check").fetchall() == []
    assert con.execute("SELECT name FROM place WHERE id = ?", (changed[0][0] * 2 + 1,)).fetchone()[0] == "Iný štart"
    full = sqlite3.connect(":memory:")
    full.executescript(db.full_sql(new, version))
    assert _dump(con) == _dump(full)


def test_unchanged_data_writes_only_the_version_and_a_new_schema_reloads_everything():
    rows, version = db.build_rows()
    con = sqlite3.connect(":memory:")
    con.executescript(db.full_sql(rows, version))
    have = _have(con)
    sql, written = db.incremental_sql(rows, version, have)
    assert written == 1 and "INSERT INTO trip " not in sql
    assert db.incremental_sql(rows, version, {**have, "schema_hash": "old"}) == (None, None)


def test_ids_stay_the_same_across_builds():
    a = db.stable_ids(["chleb", "krivan", "sitno"])
    b = db.stable_ids(["krivan", "novy-vylet", "chleb", "sitno"])
    assert all(a[k] == b[k] for k in a)
    assert max(b.values()) < 2**31


def test_a_load_in_parts_ends_where_one_file_would():
    rows, version = db.build_rows()
    sql = db.full_sql(rows, version)
    parts = db.split_sql(sql, 200_000)
    assert len(parts) > 3 and "".join(parts) == sql
    assert all(len(p.encode()) <= 200_000 + D1_MAX_STATEMENT for p in parts)
    assert "INSERT INTO data_version" in parts[-1] and not any("INSERT INTO data_version" in p for p in parts[:-1])
    con = sqlite3.connect(":memory:")
    for p in parts:
        con.executescript(p)
    whole = sqlite3.connect(":memory:")
    whole.executescript(sql)
    assert _dump(con) == _dump(whole)


def test_an_incremental_load_hides_the_old_version_first():
    rows, version = db.build_rows()
    con = sqlite3.connect(":memory:")
    con.executescript(db.full_sql(rows, version))
    new = {t: list(r) for t, r in rows.items()}
    new["trip"][0] = new["trip"][0][:2] + ("Nový názov",) + new["trip"][0][3:-1] + ("changed",)
    sql, _ = db.incremental_sql(new, version, _have(con))
    first = db.split_sql(sql, 10_000)[0]
    assert first.startswith("DELETE FROM data_version WHERE id = 1;")


def test_values_that_sqlite_cannot_read_back_stop_the_load():
    import pytest

    for bad in (float("nan"), float("inf"), [1.0, float("nan")]):
        with pytest.raises(ValueError):
            db.q(bad)
    assert db.same((None, 1.5), (None, 1.5000000001))
    assert not db.same((None,), (1.5,)) and not db.same((1.5,), (None,))


def test_trip_json_holds_each_file_byte_for_byte_and_leaves_index_and_list_out():
    rows, _ = db.build_rows()
    slugs = {r[0] for r in rows["trip_json"]}
    assert slugs and "index" not in slugs and "list" not in slugs
    con = sqlite3.connect(":memory:")
    con.executescript(db.full_sql(rows, db.build_rows()[1]))
    tdir = db.ROOT / "public" / "data" / "trips"
    for slug, body in con.execute("SELECT slug, body FROM trip_json ORDER BY slug LIMIT 25").fetchall():
        assert body == (tdir / f"{slug}.json").read_bytes().decode("utf-8")
    assert con.execute("SELECT count(*) FROM trip_json").fetchone()[0] == len(slugs)
    assert con.execute("SELECT count(*) FROM trip_json WHERE hash = ''").fetchone()[0] == 0


def test_a_body_over_the_statement_limit_goes_in_as_pieces_and_reads_back_whole():
    body = "{" + "'š" * 40_000 + "}\n"  # ~120 KB, with quotes and two-byte letters
    rows = {"trip_json": [("big", body, "h1"), ("small", "{}", "h2")]}
    sql, written = db.trip_json_sql(rows)
    assert written == 2 and all(len(s.encode()) < db.MAX_STATEMENT_BYTES for s in sql)
    con = sqlite3.connect(":memory:")
    for s in sql:
        con.execute(s)
    assert con.execute("SELECT body, hash FROM trip_json WHERE slug = 'big'").fetchone() == (body, "h1")
    assert con.execute("SELECT body FROM trip_json WHERE slug = 'small'").fetchone()[0] == "{}"


def test_trip_json_writes_only_changed_rows_and_deletes_gone_slugs():
    rows = {"trip_json": [("a", "{1}", "ha"), ("b", "{2}", "hb"), ("c", "{3}", "hc")]}
    con = sqlite3.connect(":memory:")
    for s in db.trip_json_sql(rows)[0]:
        con.execute(s)
    have = {slug: h for slug, h in con.execute("SELECT slug, hash FROM trip_json")}
    new = {"trip_json": [("a", "{1}", "ha"), ("b", "{22}", "hb2"), ("d", "{4}", "hd")]}
    sql, written = db.trip_json_sql(new, have)
    assert written == 3  # b changed, d new, c gone
    assert not any("'a'" in s for s in sql)
    for s in sql:
        con.execute(s)
    assert dict(con.execute("SELECT slug, body FROM trip_json")) == {"a": "{1}", "b": "{22}", "d": "{4}"}


def test_a_database_without_trip_json_gets_all_of_it_and_the_fingerprint_follows_the_files():
    rows, version = db.build_rows()
    con = sqlite3.connect(":memory:")
    con.executescript(db.full_sql(rows, version))
    con.execute("DROP TABLE trip_json")
    con.executescript(db.TRIP_JSON_SCHEMA)
    sql, written = db.incremental_sql(rows, version, _have(con))
    assert written > len(rows["trip_json"])
    con.executescript(sql)
    assert con.execute("SELECT count(*) FROM trip_json").fetchone()[0] == len(rows["trip_json"])
    before = db.fingerprint(db.data_body(rows))
    rows["trip_json"][0] = rows["trip_json"][0][:2] + ("changed",)
    assert db.fingerprint(db.data_body(rows)) != before
