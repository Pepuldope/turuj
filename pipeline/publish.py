"""Write the trip files the site reads (docs/TRIP-DATA.md) and a human report."""

import datetime as dt
import json
from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np

from . import names, search
from .geo import LocalProjection, rdp_indices

DETAIL_ONLY = ("path", "turnaround_index", "marking_runs", "parking_alternatives", "transit_alternatives", "pois", "routes")
ATTRIBUTION = ("© OpenStreetMap contributors (ODbL); elevation: Copernicus DEM GLO-30 © DLR e.V. 2010-2014 and "
               "© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA")


# Summary fields the home list does without (it fetches the list for every trip at once).
LIST_DROP = ("description", "gpx_url", "marked_share", "curated", "protected_area", "max_ele_m")


def write(root, trips, dem, drive, slugs, report, osm_data_at, now=None):
    """Trip files are static assets (public/data), so thousands of trips never weigh on the site's code bundle."""
    root = Path(root)
    now = now or dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    tdir = root / "public" / "data" / "trips"
    gdir = root / "public" / "gpx"
    tdir.mkdir(parents=True, exist_ok=True)
    gdir.mkdir(parents=True, exist_ok=True)
    keep = {t["slug"] for t in trips}
    for f in tdir.glob("*.json"):
        if f.name not in ("index.json", "list.json") and f.stem not in keep:
            f.unlink()
    place_files = {t.get("variant_of") or t["slug"] for t in trips}
    for f in gdir.glob("*.gpx"):
        if f.stem not in place_files:
            f.unlink()

    _attach_routes(trips)
    # One GPX file per place, the main route first, then its other routes, each track tagged with
    # its trip's slug: Cloudflare's free plan takes at most 20,000 files per deploy, and a file per
    # route (a third of them) pushed the deploy to its edge. The trip points at its own track with
    # "#<slug>" (lib/gpx.ts); a reader that ignores it gets the main route.
    places = {}
    for t in trips:
        places.setdefault(t.get("variant_of") or t["slug"], []).append(t)
    for place, group in places.items():
        group.sort(key=lambda t: bool(t.get("variant_of")))
        tracks = [(t["slug"], t["name"], t.pop("_gpx")) for t in group]
        (gdir / f"{place}.gpx").write_text(_gpx(group[0]["name"], tracks, dem))
        for t in group:
            t["gpx_url"] = f"/gpx/{place}.gpx" + (f"#{t['slug']}" if t.get("variant_of") else "")
    summaries = []
    for t in trips:
        _dump(tdir / f"{t['slug']}.json", t)
        summaries.append(_without_walks({k: v for k, v in t.items() if k not in DETAIL_ONLY}))

    # The site reads index.json at run time, so it holds the main routes only; the other routes
    # are in their own trip files, listed by each trip of the place ("routes"). The database
    # load still takes every route, from data/trip-variants.json.
    mains = [t for t in summaries if not t.get("variant_of")]
    _dump(tdir / "index.json", dict(version=1, generated_at=now, osm_data_at=osm_data_at, attribution=ATTRIBUTION, trips=mains))
    _dump(root / "data" / "trip-variants.json", dict(version=1, generated_at=now,
                                                    trips=[t for t in summaries if t.get("variant_of")]))
    # The home list and map show one trip per place; its other routes are on the trip page.
    _dump(tdir / "list.json", dict(version=1, generated_at=now, trips=[_list_item(t) for t in mains]))

    if drive is not None:
        towns, minutes, km, source = drive
        ddir = root / "public" / "data" / "drive"
        ddir.mkdir(parents=True, exist_ok=True)
        ids = {t["id"] for t in towns}
        for f in ddir.glob("*.json"):
            if f.stem not in ids:
                f.unlink()
        slugs_order = [t["slug"] for t in trips if not t.get("variant_of")]  # main routes, as run.py routed them
        for town, mrow, krow in zip(towns, minutes, km):
            _dump(ddir / f"{town['id']}.json", dict(
                version=1, generated_at=now, town=town["id"],
                minutes=dict(zip(slugs_order, mrow)), km=dict(zip(slugs_order, krow))))
        (root / "data" / "towns.json").write_text(json.dumps(dict(
            version=1, generated_at=now, source=source, towns=towns), ensure_ascii=False, indent=1) + "\n")

    (root / "pipeline" / "slugs.json").write_text(json.dumps(dict(sorted(slugs.items())), ensure_ascii=False, indent=1) + "\n")
    (root / "data" / "pipeline-report.md").write_text(_report(trips, report, now, osm_data_at, drive))
    # what the home search finds besides trip names: starts, car parks, stops, huts by every trip
    search.write(root, search.load_trips(tdir))


def _without_walks(summary):
    """The walk lines to the trail (pipeline/walks.py) stay in the trip's own file: index.json is
    read at run time and must stay small (lib/assetBudget.test.ts)."""
    for k in ("parking", "transit"):
        if summary.get(k) and "walk" in summary[k]:
            summary[k] = {kk: v for kk, v in summary[k].items() if kk != "walk"}
    return summary


def _attach_routes(trips):
    """Every route of a place that has several gets the list of them all, main first, with the
    way up of each, so the trip page needs nothing but its own file."""
    groups = {}
    for t in trips:
        groups.setdefault(t.get("variant_of") or t["slug"], []).append(t)
    for group in groups.values():
        if len(group) < 2:
            continue
        group = sorted(group, key=lambda t: (bool(t.get("variant_of")), t["duration_min"]))
        briefs = [_route_brief(t) for t in group]
        for t in group:
            t["routes"] = briefs


def _route_brief(t):
    up = t["path"] if t["route"] == "okruh" else t["path"][: t["turnaround_index"] + 1]
    b = dict(slug=t["slug"], route_label=t.get("route_label"), start_name=t["start"]["name"],
             parking=t.get("parking") is not None, transit=t.get("transit") is not None,
             duration_min=t["duration_min"], distance_m=t["distance_m"], ascent_m=t["ascent_m"],
             up=[[p[0], p[1]] for p in up])
    if t.get("variant_of"):
        b["variant_of"] = t["variant_of"]
    return b


def _dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")


def _list_item(summary):
    """A summary without the text and OSM ids the home list never shows."""
    t = {k: v for k, v in summary.items() if k not in LIST_DROP}
    for k in ("destination", "start", "parking", "transit"):
        if t.get(k):
            t[k] = {kk: vv for kk, vv in t[k].items() if kk != "osm"}
    return t


def _gpx(name, tracks, dem):
    """GPX with one track per (slug, name, line) in tracks; the slug goes in the track's <desc>."""
    n = escape(name)
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<gpx version="1.1" creator="Túruj (OpenStreetMap)" xmlns="http://www.topografix.com/GPX/1/1">',
           f'  <metadata><name>{n}</name><copyright author="OpenStreetMap contributors"><license>https://opendatacommons.org/licenses/odbl/</license></copyright></metadata>']
    for slug, tname, g in tracks:
        lat, lon, _ele, _rt, turn, loop = g
        lat, lon = np.asarray(lat), np.asarray(lon)
        if not loop:
            lat = np.concatenate([lat[: turn + 1], lat[:turn][::-1]])
            lon = np.concatenate([lon[: turn + 1], lon[:turn][::-1]])
        keep = rdp_indices(LocalProjection().xy(lat, lon), 2.0)
        lat, lon = lat[keep], lon[keep]
        ele = dem.sample(lat, lon) if dem else np.full(len(lat), np.nan)
        out.append(f"  <trk><name>{escape(tname)}</name><desc>{escape(slug)}</desc><trkseg>")
        for la, lo, e in zip(lat, lon, ele):
            out.append(f'    <trkpt lat="{la:.6f}" lon="{lo:.6f}">' + (f"<ele>{e:.0f}</ele>" if np.isfinite(e) else "") + "</trkpt>")
        out.append("  </trkseg></trk>")
    out += ["</gpx>", ""]
    return "\n".join(out)


def _report(trips, rep, now, osm_at, drive):
    L = [f"# Trip pipeline report", "", f"Run: {now} · OSM data: {osm_at or 'unknown'}", "",
         f"**{len(trips)} trips**", "", "| Region | Trips | Family | Candidates |", "|---|---|---|---|"]
    for rid, r in rep["regions"].items():
        fam = sum(1 for t in trips if t["region"] == rid and t["family_friendly"])
        n = sum(1 for t in trips if t["region"] == rid)
        L.append(f"| {rid} | {n} | {fam} | {r['candidates']} |")
    L += ["", "## Regression: the 10 hand-picked trips vs. the 2026-10-07 build", "",
          "Flag ⚠ when off by more than 15 %.", "",
          "| Trip | Distance (new / old) | Ascent | Time |", "|---|---|---|---|"]
    for r in rep["regression"]:
        if "error" in r:
            L.append(f"| {r['slug']} | ❌ {r['error']} | | |")
            continue
        cells = []
        for k in ("distance_m", "ascent_m", "duration_min"):
            if k in r:
                new, old, d = r[k]
                cells.append(f"{new} / {old} ({d:+.0%}){' ⚠' if abs(d) > 0.15 else ''}")
            else:
                cells.append("")
        L.append(f"| {r['slug']} | " + " | ".join(cells) + " |")
    groups = {}
    for t in trips:
        groups.setdefault(t.get("variant_of") or t["slug"], []).append(t)
    multi = [g for g in groups.values() if len(g) > 1]
    L += ["", "## Places with more than one route", "",
          f"{len(multi)} of {len(groups)} places have other routes; {rep.get('variants', 0)} other routes in all, "
          f"{rep.get('alternatives', 0)} of them another way from a start the place already has.", "",
          "| Place | Main route (start, time) | Other routes |", "|---|---|---|"]
    for g in sorted(multi, key=lambda g: -g[0]["rank"])[:60]:
        m, rest = g[0], g[1:]
        fmt = lambda t: f"{t['start']['name']} {t['duration_min'] // 60}:{t['duration_min'] % 60:02d}"
        L.append(f"| {m['slug']} | {fmt(m)} | " + "; ".join(f"{t['route_label']}: {fmt(t)}" for t in rest) + " |")
    tries = rep.get("alt_tries", [])
    L += ["", "## Other ways from the same start (hand-picked trips)", "",
          "| Trip | Start | Result | New metres | Minutes |", "|---|---|---|---|---|"]
    L += [f"| {x['slug']} | {x['start']} | {x['why']} | {x.get('new_m', '')} | {x.get('min', '')} |" for x in tries]
    town = rep.get("town", [])
    L += ["", "## Town filter", "",
          f"{sum(1 for x in town if x[2] == 'city centre')} goals in city centres and "
          f"{sum(1 for x in town if x[2] == 'in town')} sights in towns left out; "
          f"{sum(1 for x in town if x[2] == 'city walk')} routes left out as city walks; "
          f"{len({x[0] for x in town if x[2].startswith('streets')})} goals in nature start out of town instead of "
          f"walking village or town streets, {len(rep.get('town_kept', []))} keep such a start (none out of town is "
          "about as quick).", "",
          "| Goal | Kind | Why | Start | Town metres |", "|---|---|---|---|---|"]
    L += [f"| {n} | {k} | {w} | {st} | {m} |" for n, k, w, st, m in town if not w.startswith("streets")]
    L += [f"| {n} | instead: {k} | streets, start out of town used | {st} | {m} |"
          for n, k, w, st, m in [x for x in town if x[2].startswith("streets")]]
    nm = rep.get("names") or {}
    found = names.problems(trips)
    L += ["", "## Name check", "",
          f"{len(nm.get('renamed', []))} names now say what the place is, "
          f"{len(nm.get('merged', []))} places mapped twice merged, "
          f"{len(nm.get('told_apart', []))} shared names told apart by the nearest village, "
          f"{len(rep.get('foreign', []))} foreign names left out. Still wrong: {len(found)}.", ""]
    L += [f"- {sev}: {text}" for sev, text in found]
    L += ["", "| Was | Now | Slug |", "|---|---|---|"]
    L += [f"| {a} | {b} | {s} |" for a, b, s in nm.get("renamed", []) + nm.get("told_apart", [])]
    if nm.get("merged"):
        L += ["", "Merged (left out → kept, metres apart):", ""]
        L += [f"- {a} ({s}) → {b} ({k}), {m} m" for a, s, b, k, m in nm["merged"]]
    if rep.get("foreign"):
        L += ["", "Foreign names left out: " + ", ".join(sorted(set(rep["foreign"])))]
    watch = rep.get("watch") or {}
    if rep.get("watch_names"):
        L += ["", "## Well-known places (config `watch`)", "", "| Place | What happened |", "|---|---|"]
        for n in rep.get("watch_names", []):
            notes = watch.get(n) or ["not among the OSM goals (no peak, hut, castle, viewpoint, tarn, waterfall or cave of this name)"]
            L.append(f"| {n} | " + "; ".join(dict.fromkeys(notes)) + " |")
    if rep.get("unused"):
        L += ["", "## Well-known places by a marked trail that are no trip (no goal kind for them)", "",
              "| Wikipedia languages | Name | OSM tag | Region | OSM |", "|---|---|---|---|---|"]
        L += [f"| {fm} | {n} | {tag} | {r} | {o} |" for fm, n, tag, r, o in rep["unused"]]
    labels = rep.get("start_labels") or {}
    used = sorted({(t["start"]["osm"], t["start"]["name"]) for t in trips if t["start"]["osm"] in labels}, key=lambda x: x[1])
    if used:
        L += ["", "## Starts named by what is round them (the guidepost is only a junction)", "",
              "| Guidepost | Start name | OSM |", "|---|---|---|"]
        L += [f"| {labels[o][0]} | {n} | {o} |" for o, n in used]
    L += ["", "## Rejected candidates", ""] + [f"- {k}: {v}" for k, v in sorted(rep["rejected"].items())]
    if rep.get("unresolved"):
        L += ["", "## Rule place names not found in OSM (check spelling in the rule files)", ""]
        L += [f"- {rid}: {', '.join(names)}" for rid, names in rep["unresolved"].items()]
    # What each closure covers, to catch a rule on the wrong trips: a ridge closure on a trip that
    # never climbs above the huts, or a rule that covers nothing.
    L += ["", "## Closure rules", "", "| Rule | Trips | Lowest top (m) | Lowest trips |", "|---|---|---|---|"]
    for rid in sorted({i for t in trips for i in t["closure_rule_ids"]} | set(rep.get("idle_rules", []))):
        on = sorted((t for t in trips if rid in t["closure_rule_ids"]), key=lambda t: t.get("max_ele_m") or 0)
        low = ", ".join(f"{t['slug']} ({t.get('max_ele_m')})" for t in on[:5])
        L.append(f"| {rid} | {len(on)} | {on[0].get('max_ele_m') if on else '-'} | {low} |")
    for rid, secs in rep.get("rule_sections", {}).items():
        L += ["", f"Stretches of {rid}:", ""] + [f"- {label}: {m / 1000:.1f} km" for label, m in secs]
    L += ["", "## Trips", "", "| Slug | Region | Start | km | ↑ m | Time | Diff. | Rules |", "|---|---|---|---|---|---|---|---|"]
    for t in trips:
        rules = ", ".join(t["closure_rule_ids"] + [f["rule_id"] or "osm fee" for f in t["fees"]])
        L.append(f"| {t['slug']} | {t['region']} | {t['start']['name']} | {t['distance_m'] / 1000:.1f} | "
                 f"{t['ascent_m']} | {t['duration_min'] // 60}:{t['duration_min'] % 60:02d} | {t['difficulty']} | {rules} |")
    if drive is not None:
        towns, minutes, _km, _ = drive
        missing = sum(1 for row in minutes for v in row if v is None)
        L += ["", f"Drive table: {len(towns)} towns x {len(minutes[0]) if minutes else 0} main trips, {missing} pairs without a route."]
    return "\n".join(L) + "\n"
