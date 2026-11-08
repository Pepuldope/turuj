"""Run the trip pipeline.

    python -m pipeline.run --pbf slovakia-latest.osm.pbf --dem pipeline/.cache/dem \
        [--osrm http://localhost:5000] [--wikidata] [--root .]
"""

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import yaml

from . import drive as drive_mod
from . import areas, border, maplines
from . import osm as osm_mod
from . import publish, redirects
from . import walks
from .dem import Dem
from .graph import Graph
from .rules import RuleMatcher, section_keys
from .trips import TripBuilder

UA = "Turuj trip pipeline (https://github.com/Pepuldope/turuj)"


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr, flush=True)


def sitelinks(qids):
    """Wikipedia article counts per Wikidata id (used for ranking only; failures are ignored)."""
    out = {}
    failed = 0
    # Only well-formed ids: one "Q1;Q2" or typo in OSM makes Wikidata refuse the whole batch.
    qids = sorted({q.strip() for v in qids for q in str(v).split(";") if re.fullmatch(r"Q\d+", q.strip())})
    for i in range(0, len(qids), 50):
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&format=json&ids="
               + "|".join(qids[i : i + 50]))
        # A failed batch is retried, then skipped: one hiccup must not zero the fame of every later
        # place (Rysy, Skalnaté pleso lost their trips that way on 2026-10-14).
        for wait in (0, 3, 10, 30):
            time.sleep(wait)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = json.loads(r.read())
                if "entities" not in body:
                    raise ValueError(str(body.get("error", body))[:200])
                ents = body["entities"]
                for q, e in ents.items():
                    out[q] = len([k for k in e.get("sitelinks", {}) if k.endswith("wiki") and k != "commonswiki"])
                break
            except Exception as e:  # ranking still works without it
                log(f"wikidata (batch {i // 50 + 1}, retry in a moment): {e}")
        else:
            failed += 1
    log(f"wikidata: {len(out)} of {len(qids)} ids, {failed} batches failed")
    return out


def replay_closures(cm, closures, trips_dir=Path("public/data/trips")):
    """Walk last week's trips through today's closure rules and print each trip whose rules would
    change, so a rule edit shows its effect in the pull-request check. Only rules decided by stretches,
    probes and goals: the trip files don't keep the route refs or way tags a walk used."""
    from .geo import resample
    from .rules import STEP_M

    geo_only = {r["id"] for r in closures if not (r.get("selector") or {}).get("route_refs")
                and not (r.get("selector") or {}).get("way_tags")}
    changed = 0
    for f in sorted(trips_dir.glob("*.json")):
        t = json.loads(f.read_text())
        if not isinstance(t, dict) or not t.get("path") or "closure_rule_ids" not in t:
            continue
        lon, lat = (np.array([p[i] for p in t["path"]], float) for i in (0, 1))
        rl, ro, _ = resample(lat, lon, STEP_M)
        d = t["destination"]
        now = set(cm.match(rl, ro, set(), set(), (d["location"]["lat"], d["location"]["lon"]), d.get("name"))) & geo_only
        was = set(t["closure_rule_ids"]) & geo_only
        if now != was:
            changed += 1
            print(f"WOULD CHANGE {t['slug']}: {sorted(was)} -> {sorted(now)}")
    print(f"{changed} trips would change their closure rules")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--dem", default=None, help="folder with Copernicus DEM tiles")
    ap.add_argument("--osrm", default=None, help="OSRM server URL for the drive table")
    ap.add_argument("--osrm-foot", default=None, help="OSRM server URL (foot profile) for the walks to the trail")
    ap.add_argument("--wikidata", action="store_true")
    ap.add_argument("--root", default=".")
    ap.add_argument("--osm-timestamp", default=None)
    ap.add_argument("--force", action="store_true", help="publish even if the trip count dropped a lot")
    ap.add_argument("--strict-rules", action="store_true",
                    help="stop when a closure or fee rule names a place or trail stretch OSM lacks, or covers no trip")
    ap.add_argument("--rules-only", action="store_true", help="only find the rule places and stretches, print them and stop")
    a = ap.parse_args(argv)
    root = Path(a.root)

    cfg = yaml.safe_load((root / "pipeline" / "config.yaml").read_text())
    closures = json.loads((root / "data" / "closure-rules.json").read_text())["rules"]
    fees = json.loads((root / "data" / "fee-rules.json").read_text())["rules"]
    overrides = yaml.safe_load((root / "pipeline" / "overrides.yaml").read_text()) or {}
    slugs_file = root / "pipeline" / "slugs.json"
    slugs = json.loads(slugs_file.read_text()) if slugs_file.exists() else {}
    slugs_before = dict(slugs)
    redirects.apply_renames(slugs, cfg.get("slug_renames") or {})
    published = redirects.previous(root)
    probe_names = {n for r in closures + fees for n in (r.get("selector") or {}).get("probes", [])}
    boxes = [b for r in cfg["regions"] for b in r["bboxes"]]

    log("reading OSM")
    osm = osm_mod.load(a.pbf, boxes, probe_names, name_keys=section_keys(closures + fees), include=cfg.get("include") or [])
    log(f"routes {len(osm.routes)}, ways {len(osm.ways)}, guideposts {len(osm.guideposts)}, parking {len(osm.parking)}, "
        f"stops {len(osm.stops)}, destinations {len(osm.destinations)}, towns {len(osm.towns)}, border {'yes' if osm.border is not None else 'no'}")
    if osm.border is None and (last := border.read(root)) is not None:
        # The border relation didn't come through (a broken download, an edit mid-way): without it,
        # trips abroad and foreign towns would slip in, so keep last week's outline.
        from shapely.geometry import Point

        log("border not in the OSM file: using last week's public/data/map/border.json")
        osm.border = last
        osm.towns = [f for f in osm.towns if last.contains(Point(f.lon, f.lat))]
    graph = Graph(osm)
    log(f"graph: {graph.n} nodes, {len(graph.edge_key)} edges")
    dem = Dem(a.dem) if a.dem else None
    if dem and not dem.available:
        log("no DEM tiles found, ascent falls back to OSM elevations")
        dem = None

    qids = [f.tags["wikidata"] for _, f in osm.destinations if f.tags.get("wikidata")]
    qids += [f.tags["wikidata"] for f in osm.others if f.tags.get("wikidata")]
    links = sitelinks(qids) if a.wikidata else {}
    cm, fm = (RuleMatcher(rs, osm.probes, graph, osm.named, osm.guideposts) for rs in (closures, fees))
    unresolved = {**cm.unresolved, **fm.unresolved}
    if a.rules_only:
        for rid, secs in {**cm.sections, **fm.sections}.items():
            for label, m in secs:
                print(f"{rid}: {label} ({m / 1000:.1f} km)")
        for rid, secs in cm.ends.items():
            for label, found in secs:
                for k, f in zip(("from", "to"), found):
                    if len(f["near"]) > 1:
                        print(f"  {rid}: {label}: {k} took {f['took']}; near the route: {'; '.join(f['near'][:6])}")
        for rid, what in unresolved.items():
            print(f"NOT FOUND {rid}: " + "; ".join(what))
        replay_closures(cm, closures)
        return 1 if unresolved else 0
    car_ok = drive_mod.CarCheck(a.osrm, cfg["trips"]["parking_road_max_m"]) if a.osrm else None
    tb = TripBuilder(cfg, osm, graph, dem, cm, fm, slugs, links, log, car_ok)
    trips = tb.build()
    trips = apply_overrides(trips, overrides)
    # one fixed order for every output (index, drive-table columns)
    trips.sort(key=lambda t: (t["region"], -t["rank"], t["slug"]))
    if car_ok:
        log(f"parkings checked for car access: {car_ok.checked}, unreachable: {car_ok.rejected}")
    tb.report["unresolved"] = unresolved
    tb.report["rule_sections"] = cm.sections
    log(f"{len(trips)} trips")
    # A rule that finds no place or covers no trip is a rule that silently stopped working
    # (tanap-juranova-dolina covered nothing for weeks, 2026-10-17): stop before publishing.
    used = {i for t in trips for i in t["closure_rule_ids"]} | {f["rule_id"] for t in trips for f in t["fees"]}
    idle = [r["id"] for r in closures + fees
            if r.get("selector") and not r["selector"].get("may_cover_no_trip") and r["id"] not in used]
    tb.report["idle_rules"] = idle
    if a.strict_rules and (unresolved or idle):
        for rid, what in unresolved.items():
            log(f"rule {rid}: not found in OSM: " + "; ".join(what))
        for rid in idle:
            log(f"rule {rid} covers no trip")
        log("rules don't match the map: refusing to publish (fix data/*-rules.json, or run without --strict-rules)")
        return 1

    prev = root / "public" / "data" / "trips" / "index.json"
    if prev.exists() and not a.force:
        # Places, not routes: index.json lists the main route of each place.
        n_prev = sum(not t.get("variant_of") for t in json.loads(prev.read_text())["trips"])
        n_new = sum(not t.get("variant_of") for t in trips)
        if n_prev >= 20 and n_new < 0.7 * n_prev:
            log(f"place count fell from {n_prev} to {n_new}: refusing to publish (use --force)")
            return 1

    drive = None
    if a.osrm:
        town_list = drive_mod.towns(osm)
        # The home list is the only user of the town table, and it lists main routes only.
        minutes, km = drive_mod.table(a.osrm, town_list, [t for t in trips if not t.get("variant_of")], log)
        drive = (town_list, minutes, km, "OSRM car profile on OpenStreetMap data")

    if a.osrm_foot:
        walks.add(a.osrm_foot, trips, log)

    publish.write(root, trips, dem, drive, slugs, tb.report, a.osm_timestamp)
    # Slugs this build changed (a key's slug differs from last week's), and the old addresses that still lead somewhere.
    renames = {v: slugs[k] for k, v in slugs_before.items() if k in slugs and slugs[k] != v}
    table = redirects.update(redirects.load(root), published, {t["slug"] for t in trips}, renames)
    redirects.write(root, table)
    log(f"slug redirects: {len(table)}")
    log("map lines: %d trips in %d cells" % maplines.write(root))
    if osm.border is not None:
        log("map border: %d points" % border.write(root, osm.border))
    # After the border: the areas are cut to it.
    log("map areas: %d" % areas.write(root))
    log("done")
    return 0


def apply_overrides(trips, overrides):
    drop = set(overrides.get("drop", []) or [])
    edits = overrides.get("trips", {}) or {}
    out = []
    for t in trips:
        if t["slug"] in drop or t.get("variant_of") in drop:
            continue
        for k in ("name", "description"):
            if edits.get(t["slug"], {}).get(k):
                t[k] = edits[t["slug"]][k]
        # the other routes to a renamed place carry its new name
        if t.get("variant_of") and not t.get("curated") and edits.get(t["variant_of"], {}).get("name"):
            t["name"] = edits[t["variant_of"]]["name"]
        out.append(t)
    return out


if __name__ == "__main__":
    sys.exit(main())
