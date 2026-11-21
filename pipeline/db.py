"""Trip data as SQL for the Cloudflare D1 database behind /api/vylety.

Reads what the weekly build writes (public/data/trips, public/data/drive,
data/towns.json, data/closure-rules.json) and prints one SQL file. Given what
the database holds (--have), it writes only the trips and rows that changed:
D1's free plan writes 100k rows a day and a full load is ~55k. Otherwise it
drops and refills the trip tables. The visit counter's tables in the same database are not touched.
The schema follows strategy/12-research/db/01_schema.sql, trimmed to what the
site serves (no users or partners yet) plus the walk geometry per trip.

    python -m pipeline.db > build/db.sql                       # full load
    python -m pipeline.db --have have.json --out build/db.sql  # only what changed
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Child tables first, so DROP never trips over a foreign key.
TABLES = [
    "data_version", "town_drive", "drive_time", "town", "trip_fee", "fee", "trip_closure", "closure_rule",
    "poi", "trip_transit_stop", "transit_stop", "parking", "trip", "place", "protected_area", "region",
]

SCHEMA = """
CREATE TABLE region (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);
CREATE TABLE protected_area (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);
CREATE TABLE place (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  kind     TEXT NOT NULL CHECK (kind IN ('start','vrchol','vyhliadka','hrad','chata','pleso','vodopad','jaskyna','roklina','ine')),
  lat      REAL NOT NULL CHECK (lat BETWEEN 47.7 AND 49.7),
  lon      REAL NOT NULL CHECK (lon BETWEEN 16.8 AND 22.6),
  ele_m    INTEGER,
  osm_ref  TEXT
);
CREATE TABLE trip (
  id                 INTEGER PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  region_id          INTEGER NOT NULL REFERENCES region(id),
  protected_area_id  INTEGER REFERENCES protected_area(id),
  destination_id     INTEGER NOT NULL REFERENCES place(id),
  start_id           INTEGER NOT NULL REFERENCES place(id),
  route_type         TEXT NOT NULL CHECK (route_type IN ('tam-a-spat','okruh')),
  distance_m         INTEGER NOT NULL CHECK (distance_m > 0),
  ascent_m           INTEGER NOT NULL CHECK (ascent_m >= 0),
  duration_min       INTEGER NOT NULL CHECK (duration_min > 0),
  max_ele_m          INTEGER,
  difficulty         TEXT NOT NULL CHECK (difficulty IN ('lahka','stredna','tazka')),
  family_friendly    INTEGER NOT NULL CHECK (family_friendly IN (0,1)),
  marked_share       REAL NOT NULL CHECK (marked_share BETWEEN 0 AND 1),
  rank               INTEGER NOT NULL CHECK (rank BETWEEN 0 AND 100),
  curated            INTEGER NOT NULL CHECK (curated IN (0,1)),
  gpx_url            TEXT NOT NULL,
  -- KST colours along the walk, e.g. ["red","green"]
  marking_json       TEXT NOT NULL,
  bbox_json          TEXT NOT NULL,
  -- The walk itself: [[lon, lat, ele], ...], where it turns back, and its colour runs
  path_json          TEXT,
  turnaround_index   INTEGER,
  marking_runs_json  TEXT,
  -- Another route to a place: the slug of its main trip, and why someone would pick it
  variant_of         TEXT,
  route_label        TEXT,
  route_count        INTEGER,
  -- Hash of this trip with its places, parking, stops, POIs, closures and fees: a load
  -- rewrites only trips whose hash changed.
  content_hash       TEXT NOT NULL,
  CHECK (start_id <> destination_id)
);
-- The tables below hang off one trip each. They are keyed by (trip_id, position) and
-- stored in that order (WITHOUT ROWID), so a trip's rows are found without an extra
-- index: on D1 every index entry counts as another row written.
CREATE TABLE parking (
  trip_id    INTEGER NOT NULL REFERENCES trip(id),
  id         INTEGER NOT NULL,
  name       TEXT,
  lat        REAL NOT NULL,
  lon        REAL NOT NULL,
  walk_m     INTEGER NOT NULL CHECK (walk_m >= 0),
  fee_paid   INTEGER CHECK (fee_paid IN (0,1)),
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0,1)),
  osm_ref    TEXT,
  -- The walk to the trail on paths: {"line": [[lon, lat], ...], "m": 420, "min": 6} (pipeline/walks.py)
  walk_json  TEXT,
  PRIMARY KEY (trip_id, id)
) WITHOUT ROWID;
CREATE TABLE transit_stop (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  mode     TEXT NOT NULL CHECK (mode IN ('autobus','elektricka','vlak')),
  lat      REAL NOT NULL,
  lon      REAL NOT NULL,
  osm_ref  TEXT
);
CREATE TABLE trip_transit_stop (
  trip_id     INTEGER NOT NULL REFERENCES trip(id),
  stop_id     INTEGER NOT NULL REFERENCES transit_stop(id),
  walk_m      INTEGER NOT NULL CHECK (walk_m >= 0),
  is_primary  INTEGER NOT NULL CHECK (is_primary IN (0,1)),
  position    INTEGER NOT NULL,
  walk_json   TEXT,
  PRIMARY KEY (trip_id, stop_id)
) WITHOUT ROWID;
CREATE TABLE poi (
  trip_id   INTEGER NOT NULL REFERENCES trip(id),
  position  INTEGER NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('vyhliadka','chata','obcerstvenie','pramen','hrad','ihrisko','utulna')),
  name      TEXT NOT NULL,
  lat       REAL NOT NULL,
  lon       REAL NOT NULL,
  osm_ref   TEXT,
  detour_min INTEGER,  -- minutes there and back off the walk; NULL = on the walk
  food      TEXT CHECK (food IN ('restauracia','kaviaren','bufet')),  -- food places only
  PRIMARY KEY (trip_id, position)
) WITHOUT ROWID;
CREATE TABLE closure_rule (
  id           TEXT PRIMARY KEY,
  reason       TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('rocna','jednorazova')),
  starts_on    TEXT NOT NULL,
  ends_on      TEXT NOT NULL,
  source_url   TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  verified_on  TEXT NOT NULL,
  applies_to   TEXT,
  CHECK (ends_on >= starts_on)
);
CREATE TABLE trip_closure (
  trip_id  INTEGER NOT NULL REFERENCES trip(id),
  rule_id  TEXT NOT NULL REFERENCES closure_rule(id),
  PRIMARY KEY (trip_id, rule_id)
) WITHOUT ROWID;
CREATE TABLE fee (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,
  text         TEXT NOT NULL,
  amount_eur   REAL CHECK (amount_eur IS NULL OR amount_eur >= 0),
  source       TEXT NOT NULL CHECK (source IN ('osm','rule')),
  source_url   TEXT,
  rule_id      TEXT
);
CREATE TABLE trip_fee (
  trip_id  INTEGER NOT NULL REFERENCES trip(id),
  fee_id   INTEGER NOT NULL REFERENCES fee(id),
  PRIMARY KEY (trip_id, fee_id)
) WITHOUT ROWID;
CREATE TABLE town (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL,
  lat   REAL NOT NULL,
  lon   REAL NOT NULL
);
-- Car minutes and km from one town to every main trip (no variant_of), as JSON arrays
-- in trip id order ([95, 103, null, ...]; null = no road). One row per town rather than
-- one per town and trip: with thousands of trips that would be hundreds of
-- thousands of rows, more than D1's free plan writes in a day.
CREATE TABLE town_drive (
  town_id       INTEGER PRIMARY KEY REFERENCES town(id),
  minutes_json  TEXT NOT NULL,
  km_json       TEXT NOT NULL
);
-- One row: which weekly build is loaded. Written last, so a reader that finds
-- it knows every other table is complete.
CREATE TABLE data_version (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  generated_at  TEXT NOT NULL,
  osm_data_at   TEXT,
  trips         INTEGER NOT NULL,
  fingerprint   TEXT NOT NULL,
  schema_hash   TEXT NOT NULL
);
"""

# D1 caps one SQL statement at 100 KB; at 80 KB the local D1 (wrangler --local)
# already runs out of memory, so INSERTs are cut at 40 KB.
MAX_STATEMENT_BYTES = 40_000
PART_BYTES = 2_000_000  # one `wrangler d1 execute --file` (more runs out of D1 CPU time)
FULL_LOAD_SHARE = 0.5  # an incremental load writing more than this share of a full one becomes a full one
PART_STATEMENTS = 20  # a DELETE of 500 trips' rows costs D1 far more CPU than its few bytes say


def q(v):
    """A Python value as an SQL literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        if not math.isfinite(v):
            raise ValueError(f"{v} can't go into the database (a NaN or infinite number in the trip data)")
        return repr(v)
    if isinstance(v, (list, dict)):
        v = json.dumps(v, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return "'" + str(v).replace("'", "''") + "'"


def inserts(table, columns, rows):
    head = f"INSERT INTO {table} ({','.join(columns)}) VALUES\n"
    out, batch, size = [], [], len(head)
    for r in rows:
        value = "(" + ",".join(q(v) for v in r) + ")"
        n = len(value.encode()) + 2
        if batch and size + n > MAX_STATEMENT_BYTES:
            out.append(head + ",\n".join(batch) + ";")
            batch, size = [], len(head)
        batch.append(value)
        size += n
    if batch:
        out.append(head + ",\n".join(batch) + ";")
    return out


COLUMNS = {
    "region": ["id", "slug", "name"],
    "protected_area": ["id", "name"],
    "transit_stop": ["id", "name", "mode", "lat", "lon", "osm_ref"],
    "closure_rule": ["id", "reason", "kind", "starts_on", "ends_on", "source_url", "verified_on", "applies_to"],
    "fee": ["id", "kind", "text", "amount_eur", "source", "source_url", "rule_id"],
    "town": ["id", "slug", "name", "lat", "lon"],
    "place": ["id", "name", "kind", "lat", "lon", "ele_m", "osm_ref"],
    "trip": [
        "id", "slug", "name", "description", "region_id", "protected_area_id", "destination_id", "start_id",
        "route_type", "distance_m", "ascent_m", "duration_min", "max_ele_m", "difficulty", "family_friendly",
        "marked_share", "rank", "curated", "gpx_url", "marking_json", "bbox_json",
        "path_json", "turnaround_index", "marking_runs_json", "variant_of", "route_label", "route_count", "content_hash"],
    "parking": ["trip_id", "id", "name", "lat", "lon", "walk_m", "fee_paid", "is_primary", "osm_ref", "walk_json"],
    "trip_transit_stop": ["trip_id", "stop_id", "walk_m", "is_primary", "position", "walk_json"],
    "poi": ["trip_id", "position", "kind", "name", "lat", "lon", "osm_ref", "detour_min", "food"],
    "trip_closure": ["trip_id", "rule_id"],
    "trip_fee": ["trip_id", "fee_id"],
    "town_drive": ["town_id", "minutes_json", "km_json"],
}
# Parents before children, the order rows are inserted in.
ORDER = list(COLUMNS)
# Shared by many trips: compared row by row with what the database holds.
SHARED = ["region", "protected_area", "transit_stop", "closure_rule", "fee", "town", "town_drive"]
# Belong to one trip: rewritten together with it when its content_hash changes.
PER_TRIP = ["parking", "trip_transit_stop", "poi", "trip_closure", "trip_fee"]
KEY = {t: ("town_id" if t == "town_drive" else "id") for t in SHARED} | {"place": "id"}

SCHEMA_HASH = hashlib.sha256(SCHEMA.encode()).hexdigest()[:16]

# Each trip's own file, byte for byte, for the Worker to answer /data/trips/<slug>.json from (worker.ts,
# lib/tripJson.ts): Cloudflare's free plan allows 20,000 static files per deploy and these were 6,500 of them
# (C198). Kept out of SCHEMA on purpose: it is never dropped, so a full load of the trip tables doesn't leave
# the site without trip files, and adding it forces no reload. WITHOUT ROWID: a lookup reads one row, not
# an index row and a table row. hash '' marks a body that is still being written in pieces.
TRIP_JSON_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS trip_json (slug TEXT PRIMARY KEY, body TEXT NOT NULL, hash TEXT NOT NULL) WITHOUT ROWID;"
)
NOT_TRIP_FILES = {"index.json", "list.json"}  # same folder, but served as static files
PIECE_BYTES = 30_000  # a body too big for one statement is written in pieces of about this size


def norm(v):
    """A value as the database hands it back: booleans as 0/1, lists and objects as compact JSON."""
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    return v


def stable_ids(keys):
    """The same key gets the same id in every build (a hash of it), so a load can change rows in
    place. Ids stay below 2^31, safe as JavaScript numbers even when a place id is twice a trip id."""
    ids, taken = {}, set()
    for k in sorted(set(keys)):
        n = int(hashlib.sha1(k.encode()).hexdigest()[:8], 16) & 0x7FFFFFFF or 1
        while n in taken:
            n = n % 0x7FFFFFFF + 1
        taken.add(n)
        ids[k] = n
    return ids


def build_rows(root=ROOT):
    """Every table's rows (normalised tuples in COLUMNS order) and the version info."""
    tdir = root / "public" / "data" / "trips"
    index = json.loads((tdir / "index.json").read_text())
    # index.json holds the main routes only; the other routes of each place are listed apart.
    variants = root / "data" / "trip-variants.json"
    if variants.exists():
        index["trips"] = sorted(index["trips"] + json.loads(variants.read_text())["trips"],
                                key=lambda t: (t["region"], -t["rank"], t["slug"]))  # run.py's order
    town_list = json.loads((root / "data" / "towns.json").read_text())["towns"]
    closures = json.loads((root / "data" / "closure-rules.json").read_text())["rules"]
    rule_ids = {r["id"] for r in closures}
    orphans = set()
    summaries = index["trips"]
    details = {t["slug"]: json.loads((tdir / f"{t['slug']}.json").read_text()) for t in summaries}

    def stop_key(s):
        return s.get("osm") or f"{s['name']}@{s['location']['lat']},{s['location']['lon']}"

    def fee_key(f):
        return f"{f['text']}|{f.get('source_url')}"

    def stops_of(t):
        return [s for s in [t["transit"], *details[t["slug"]].get("transit_alternatives", [])] if s is not None]

    trip_id = stable_ids(t["slug"] for t in summaries)
    region_id = stable_ids(t["region"] for t in summaries)
    area_id = stable_ids(t["protected_area"] for t in summaries if t.get("protected_area"))
    stop_id = stable_ids(stop_key(s) for t in summaries for s in stops_of(t))
    fee_id = stable_ids(fee_key(f) for t in summaries for f in t["fees"])
    town_id = stable_ids(t["id"] for t in town_list)

    rows = {t: [] for t in ORDER}
    regions, areas, stops, fees = {}, {}, {}, {}
    for summary in summaries:
        slug = summary["slug"]
        detail = details[slug]
        tid = trip_id[slug]
        rid = region_id[summary["region"]]
        regions[rid] = (rid, summary["region"], summary["region_name"])
        aid = None
        if summary.get("protected_area"):
            aid = area_id[summary["protected_area"]]
            areas[aid] = (aid, summary["protected_area"])
        dest, start = summary["destination"], summary["start"]
        own = {t: [] for t in ["place", *PER_TRIP]}
        own["place"] = [
            (tid * 2, dest["name"] or "", dest["kind"], dest["location"]["lat"], dest["location"]["lon"], dest.get("ele_m"), dest.get("osm")),
            (tid * 2 + 1, start["name"] or "", "start", start["location"]["lat"], start["location"]["lon"], start.get("ele_m"), start.get("osm")),
        ]
        # The trip's own file: its parking and stop carry the walk to the trail, the index's don't.
        for i, p in enumerate([detail.get("parking", summary["parking"]), *detail.get("parking_alternatives", [])]):
            if p is None:
                continue
            own["parking"].append((tid, i, p.get("name"), p["location"]["lat"], p["location"]["lon"], p["walk_m"], p.get("fee"), i == 0, p.get("osm"), p.get("walk")))
        seen = set()
        for i, s in enumerate([detail.get("transit", summary["transit"]), *detail.get("transit_alternatives", [])]):
            if s is None:
                continue
            sid = stop_id[stop_key(s)]
            stops.setdefault(sid, (sid, s["name"], s["mode"], s["location"]["lat"], s["location"]["lon"], s.get("osm")))
            if sid in seen:
                continue
            seen.add(sid)
            own["trip_transit_stop"].append((tid, sid, s["walk_m"], i == 0, i, s.get("walk")))
        for i, p in enumerate(detail.get("pois", [])):
            own["poi"].append((tid, i, p["kind"], p["name"], p["location"]["lat"], p["location"]["lon"], p.get("osm"),
                               p.get("detour_min"), p.get("food")))
        for rule in summary["closure_rule_ids"]:
            if rule in rule_ids:
                own["trip_closure"].append((tid, rule))
            else:  # removed from closure-rules.json since the trips were built: the weekly run drops it too
                orphans.add(rule)
        for f in summary["fees"]:
            fid = fee_id[fee_key(f)]
            fees.setdefault(fid, (fid, f["kind"], f["text"], f.get("amount_eur"), f["source"], f.get("source_url"), f.get("rule_id")))
            own["trip_fee"].append((tid, fid))
        trip = (
            tid, slug, summary["name"], summary["description"], rid, aid, tid * 2, tid * 2 + 1,
            summary["route"], summary["distance_m"], summary["ascent_m"], summary["duration_min"],
            summary.get("max_ele_m"), summary["difficulty"], summary["family_friendly"],
            summary["marked_share"], summary["rank"], summary["curated"], summary["gpx_url"],
            summary["marking"], summary["bbox"],
            detail.get("path"), detail.get("turnaround_index"), detail.get("marking_runs"),
            summary.get("variant_of"), summary.get("route_label"), summary.get("route_count"),
        )
        own = {t: [tuple(norm(v) for v in r) for r in rs] for t, rs in own.items()}
        trip = tuple(norm(v) for v in trip)
        content = json.dumps([trip, own], ensure_ascii=False, separators=(",", ":"))
        rows["trip"].append(trip + (hashlib.sha256(content.encode()).hexdigest()[:16],))
        for t, rs in own.items():
            rows[t] += rs

    rows["region"] = list(regions.values())
    rows["protected_area"] = list(areas.values())
    rows["transit_stop"] = list(stops.values())
    rows["fee"] = list(fees.values())
    if orphans:
        print(f"trips name closure rules no longer in closure-rules.json, left out: {', '.join(sorted(orphans))}", file=sys.stderr)
    rows["closure_rule"] = [
        (r["id"], r["reason"], r["kind"], r["starts_on"], r["ends_on"], r["source_url"], r["verified_on"], r.get("applies_to")) for r in closures]
    rows["trip_json"] = trip_json_rows(root)
    rows["town"] = [(town_id[t["id"]], t["id"], t["name"], t["location"]["lat"], t["location"]["lon"]) for t in town_list]

    # Main trips in id order: the order of every town_drive array (lib/tripDb.ts reads it the same way).
    order = [t[1] for t in sorted(rows["trip"], key=lambda t: t[0]) if t[24] is None]
    for t in town_list:
        f = root / "public" / "data" / "drive" / f"{t['id']}.json"
        if not f.exists():
            continue
        d = json.loads(f.read_text())
        rows["town_drive"].append((town_id[t["id"]], norm([d["minutes"].get(s) for s in order]), norm([d["km"].get(s) for s in order])))

    for t in SHARED:
        rows[t] = sorted((tuple(norm(v) for v in r) for r in rows[t]), key=lambda r: r[0])
    version = {"generated_at": index["generated_at"], "osm_data_at": index.get("osm_data_at"), "trips": len(rows["trip"])}
    return rows, version


def trip_json_rows(root=ROOT):
    """(slug, body, hash) for every per-trip file, body = the file's exact text."""
    out = []
    for f in sorted((root / "public" / "data" / "trips").glob("*.json")):
        if f.name in NOT_TRIP_FILES:
            continue
        body = f.read_bytes().decode("utf-8")
        out.append((f.stem, body, hashlib.sha256(body.encode()).hexdigest()[:16]))
    return out


def trip_json_sql(rows, have=None):
    """The trip_json statements: rows whose hash differs from `have` ({slug: hash}, None = unknown, write
    all) are upserted, slugs no longer in the files are deleted. Returns (statements, rows written).
    A body over one statement's limit goes in as pieces, hash '' until the last one is in."""
    cols = "slug,body,hash"
    upsert = "\nON CONFLICT(slug) DO UPDATE SET body=excluded.body,hash=excluded.hash;"
    sql = [TRIP_JSON_SCHEMA]
    fresh = [r for r in rows["trip_json"] if have is None or have.get(r[0]) != r[2]]
    small = [r for r in fresh if len(q(r[1]).encode()) <= PIECE_BYTES]
    sql += [s[:-1] + upsert for s in inserts("trip_json", ["slug", "body", "hash"], small)]
    for slug, body, h in fresh:
        if len(q(body).encode()) <= PIECE_BYTES:
            continue
        pieces, cur, size = [], [], 2
        for ch in body:
            n = len(ch.encode()) + (ch == "'")  # a quote is doubled in the literal
            if size + n > PIECE_BYTES:
                pieces.append("".join(cur))
                cur, size = [], 2
            cur.append(ch)
            size += n
        pieces.append("".join(cur))
        sql.append(f"INSERT INTO trip_json ({cols}) VALUES ({q(slug)},{q(pieces[0])},'')" + upsert)
        sql += [f"UPDATE trip_json SET body=body||{q(p)} WHERE slug={q(slug)};" for p in pieces[1:]]
        sql.append(f"UPDATE trip_json SET hash={q(h)} WHERE slug={q(slug)};")
    written = len(fresh)
    if have is not None:
        wanted = {r[0] for r in rows["trip_json"]}
        for part in chunks(set(have) - wanted):
            sql.append(f"DELETE FROM trip_json WHERE slug IN ({','.join(q(i) for i in part)});")
            written += len(part)
    return sql, written


def version_sql(version, fp):
    return inserts("data_version", ["id", "generated_at", "osm_data_at", "trips", "fingerprint", "schema_hash"],
                   [(1, version["generated_at"], version["osm_data_at"], version["trips"], fp, SCHEMA_HASH)])


def data_body(rows):
    """Everything a load writes but the version row, as one text: its hash is the fingerprint."""
    body = SCHEMA + "\n".join(s for t in ORDER for s in inserts(t, COLUMNS[t], rows[t]))
    return body + "\ntrip_json:" + ",".join(f"{slug}={h}" for slug, _, h in rows["trip_json"])


def full_sql(rows, version, have_trip_json=None):
    """Drop and refill every trip table (the first load, and after any schema change). trip_json is not
    dropped: only its changed rows are written (all of them when `have_trip_json` is unknown)."""
    sql = [f"DROP TABLE IF EXISTS {t};" for t in TABLES]
    sql.append(SCHEMA.strip())
    for t in ORDER:
        sql += inserts(t, COLUMNS[t], rows[t])
    sql += trip_json_sql(rows, have_trip_json)[0]
    sql += version_sql(version, fingerprint(data_body(rows)))
    return "\n".join(sql) + "\n"


# What the loader asks the database before an incremental load (one result per statement).
HAVE_QUERIES = [
    "SELECT schema_hash FROM data_version WHERE id = 1",
    "SELECT id, content_hash FROM trip",
    *[f"SELECT {','.join(COLUMNS[t])} FROM {t}" for t in SHARED],
    "SELECT slug, hash FROM trip_json",  # last; the table is made first (--trip-json-sql)
]


def have_from_results(results):
    """The database's state from the results of HAVE_QUERIES (wrangler d1 execute --json)."""
    rs = [r["results"] for r in results]
    have = {"schema_hash": rs[0][0]["schema_hash"] if rs[0] else None, "trip": {r["id"]: r["content_hash"] for r in rs[1]}}
    for t, got in zip(SHARED, rs[2:]):
        have[t] = {r[KEY[t]]: tuple(r[c] for c in COLUMNS[t]) for r in got}
    have["trip_json"] = {r["slug"]: r["hash"] for r in rs[2 + len(SHARED)]}
    return have


def same(a, b):
    """Rows equal, floats within a hair: SQLite reads 19.914771 back as 19.914771000000002."""
    if a is None or len(a) != len(b):
        return False
    return all(x == y if x is None or y is None or not (isinstance(x, float) or isinstance(y, float))
               else abs(x - y) < 1e-9 for x, y in zip(a, b))


def chunks(ids, n=500):
    ids = sorted(ids)
    return [ids[i:i + n] for i in range(0, len(ids), n)]


def upserts(table, rows):
    key = KEY[table]
    cols = COLUMNS[table]
    update = ",".join(f"{c}=excluded.{c}" for c in cols if c != key)
    return [s[:-1] + f"\nON CONFLICT({key}) DO UPDATE SET {update};" for s in inserts(table, cols, rows)]


def incremental_sql(rows, version, have):
    """Only what changed since the loaded build: trips whose hash differs are deleted and written
    again with their parking, stops and POIs; shared rows are upserted or deleted one by one.
    None when the database has another schema (then a full load). Also returns the rows written."""
    if have.get("schema_hash") != SCHEMA_HASH:
        return None, None
    want = {r[0]: r[-1] for r in rows["trip"]}
    changed = {i for i, h in want.items() if have["trip"].get(i) != h}
    gone = set(have["trip"]) - set(want)
    redo = (changed & set(have["trip"])) | gone
    # First, so the site reads the static files while a load split into parts is half done.
    sql, written = ["DELETE FROM data_version WHERE id = 1;"], 0

    def delete(table, col, ids):
        for part in chunks(ids):
            sql.append(f"DELETE FROM {table} WHERE {col} IN ({','.join(q(i) for i in part)});")

    # 1. Trips that changed or are gone, with everything that hangs off them.
    if redo:
        for t in reversed(PER_TRIP):
            delete(t, "trip_id", redo)
            written += sum(1 for r in rows[t] if r[0] in redo)  # about as many as they had
        delete("trip", "id", redo)
        written += len(redo)
    # Places of gone trips only. A changed trip keeps its place ids (2 x trip id, +1 for the start), so
    # its places are updated in step 3 instead: on D1 every deleted place makes SQLite check that no trip
    # still points at it, and trip.start_id / destination_id have no index, so each one reads every trip.
    # Deleting the places of ~550 changed trips read 7.2M rows on 16 Nov 2026, over D1's free 5M a day,
    # and sign-in failed for the rest of the day.
    if gone:
        delete("place", "id", {i * 2 for i in gone} | {i * 2 + 1 for i in gone})
        written += 2 * len(gone)
    # 2. New and changed shared rows (parents of the trips below).
    for t in SHARED:
        if t == "town_drive":
            continue
        fresh = [r for r in rows[t] if not same(have[t].get(r[0]), r)]
        sql += upserts(t, fresh) if fresh else []
        written += len(fresh)
    # 3. The changed trips again.
    for t in ["place", "trip", *PER_TRIP]:
        # Place ids are twice the trip id (+1 for the start); everything else starts with the trip id.
        mine = [r for r in rows[t] if (r[0] // 2 if t == "place" else r[0]) in changed]
        # Places stay in the database (see step 1): written over in place, or added for a new trip.
        sql += (upserts(t, mine) if t == "place" else inserts(t, COLUMNS[t], mine)) if mine else []
        written += len(mine)
    # 4. Drive tables that changed, then shared rows nothing uses any more (children first).
    fresh = [r for r in rows["town_drive"] if not same(have["town_drive"].get(r[0]), r)]
    sql += upserts("town_drive", fresh) if fresh else []
    written += len(fresh)
    for t in reversed(SHARED):
        old = set(have[t]) - {r[0] for r in rows[t]}
        delete(t, KEY[t], old)
        written += len(old)
    # 5. The trips' own files for the Worker (lib/tripJson.ts), changed ones only.
    extra, n = trip_json_sql(rows, have.get("trip_json"))
    sql += extra
    written += n
    sql += version_sql(version, fingerprint(data_body(rows)))
    return "\n".join(sql) + "\n", written + 1


def split_sql(sql, max_bytes=PART_BYTES, max_statements=PART_STATEMENTS):
    """Cut a load into parts D1 runs one by one: one big file runs out of D1's CPU time
    ("D1 DB exceeded its CPU time limit and was reset", 2026-10-14). Cuts fall between statements;
    the version row is the last statement, so the site only reads the new data once every part is in."""
    parts, cur, size = [], [], 0
    stmt = []
    for line in sql.splitlines(keepends=True):
        stmt.append(line)
        if not line.rstrip().endswith(";"):
            continue
        text = "".join(stmt)
        stmt = []
        if cur and (size + len(text.encode()) > max_bytes or len(cur) >= max_statements):
            parts.append("".join(cur))
            cur, size = [], 0
        cur.append(text)
        size += len(text.encode())
    cur += stmt
    if cur:
        parts.append("".join(cur))
    return parts


def build_sql(root=ROOT):
    rows, version = build_rows(root)
    return full_sql(rows, version)


def fingerprint(sql):
    """Short hash of everything but the version row: same data, same fingerprint.
    The loader skips a load the database already holds (D1 free: 100k rows written a day)."""
    return hashlib.sha256(sql.encode()).hexdigest()[:16]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, help="write here instead of stdout")
    ap.add_argument("--parts", type=Path, help="also write the load in parts here (part-001.sql, ...), run in order")
    ap.add_argument("--fingerprint", action="store_true", help="print only the data fingerprint")
    ap.add_argument("--trip-json-sql", action="store_true", help="print the statement that makes the trip_json table (run before --have-sql)")
    ap.add_argument("--without-trip-json", action="store_true", help="leave the trips' own files (87 MB) out of the load, for tests of the other tables")
    ap.add_argument("--have-sql", action="store_true", help="print the queries whose JSON results --have reads")
    ap.add_argument("--have", type=Path, help="wrangler's JSON results of --have-sql: write only what changed")
    args = ap.parse_args(argv)
    if args.trip_json_sql:
        print(TRIP_JSON_SCHEMA)
        return
    if args.have_sql:
        print("; ".join(HAVE_QUERIES))
        return
    rows, version = build_rows()
    if args.without_trip_json:
        rows["trip_json"] = []
    if args.fingerprint:
        print(fingerprint(data_body(rows)))
        return
    sql, have = None, None
    if args.have and args.have.exists():
        try:
            have = have_from_results(json.loads(args.have.read_text()))
            sql, written = incremental_sql(rows, version, have)
        except (ValueError, KeyError, IndexError, TypeError) as err:
            print(f"database state unreadable ({err!r}): full load", file=sys.stderr)
        full_rows = sum(len(r) for r in rows.values()) + 1
        if sql is None:
            print("database has another schema or none: full load", file=sys.stderr)
        elif written > FULL_LOAD_SHARE * full_rows:
            # Deleting thousands of trips row by row runs out of D1's CPU time ("D1 DB exceeded its
            # CPU time limit", 2026-10-15, when most trips got new ids): dropping the tables is cheap.
            print(f"most trips changed ({written} of {full_rows} rows): full load", file=sys.stderr)
            sql = None
        else:
            print(f"incremental load, about {written} rows written", file=sys.stderr)
    if sql is None:
        sql = full_sql(rows, version, have["trip_json"] if have else None)
        print(f"full load, about {sum(len(r) for r in rows.values()) + 1} rows written", file=sys.stderr)
    if args.parts:
        args.parts.mkdir(parents=True, exist_ok=True)
        for old in args.parts.glob("part-*.sql"):
            old.unlink()
        parts = split_sql(sql)
        for i, part in enumerate(parts, 1):
            (args.parts / f"part-{i:03d}.sql").write_text(part)
        print(f"{len(parts)} parts", file=sys.stderr)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(sql)
    else:
        sys.stdout.write(sql)


if __name__ == "__main__":
    main()
