"""Every passenger train in Slovakia for the next weeks, from the national rail
timetable (GTFS published by ŽSR on data.slovensko.sk, CC0), so the trip page
can show real connections from your start to the station by the trail. The
browser searches the connections itself; your location never leaves it.

    python -m pipeline.rail [--gtfs gtfs.zip] [--root .] [--days 70]

Writes public/data/rail/timetable.json:
    days      ["YYYYMMDD", ...]   the dates covered, from today
    agencies  ["ZSSK", ...]
    stations  [[name, lat, lon], ...]
    services  ["0110...", ...]    one character per day in `days`: runs that day
    trips     [[label, name, agency, service, [station, arr, dep, station, arr, dep, ...]], ...]
              times in minutes after midnight of the day the train sets off (may pass 1440)
"""

import argparse
import csv
import datetime as dt
import io
import json
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path


VERSION = 1
# The last known file, used when the catalogue cannot be asked (see find_feed).
FEED_URL = "https://data.slovensko.sk/download?id=c4918871-2860-4e6f-bf67-55e5c902785d"
# The catalogue's SPARQL endpoint (the same one its website uses) and ŽSR's publisher id (its company number).
SPARQL_URL = "https://data.slovensko.sk/api/sparql"
ZSR_PUBLISHER = "https://data.gov.sk/id/legal-subject/31364501"
UA = "Turuj rail timetable (https://github.com/Pepuldope/turuj)"
MAX_CANDIDATES = 5
AGENCY_SHORT = {
    "Železničná spoločnosť Slovensko, a.s.": "ZSSK",
    "RegioJet,a.s.": "RegioJet",
    "Leo Express s.r.o.": "Leo Express",
    "Leo Express Slovensko s.r.o.": "Leo Express",
}


def log(msg):
    print(f"[rail] {msg}", flush=True)


def _rows(z, name):
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))


def _minutes(hms):
    h, m, _s = (int(x) for x in hms.split(":"))
    return h * 60 + m


def _date(s):
    return dt.date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def service_days(z, days):
    """service_id -> set of dates in `days` it runs on (calendar plus exceptions)."""
    wanted = set(days)
    on = {}
    names = set(z.namelist())
    if "calendar.txt" in names:
        weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for r in _rows(z, "calendar.txt"):
            start, end = _date(r["start_date"]), _date(r["end_date"])
            on[r["service_id"]] = {d for d in days if start <= d <= end and r[weekdays[d.weekday()]] == "1"}
    if "calendar_dates.txt" in names:
        for r in _rows(z, "calendar_dates.txt"):
            d = _date(r["date"])
            if d not in wanted:
                continue
            s = on.setdefault(r["service_id"], set())
            if r["exception_type"] == "1":
                s.add(d)
            else:
                s.discard(d)
    return on


def feed_end(z):
    """Last day the feed has timetables for: feed_info's end date, else the last calendar day."""
    names = z.namelist()
    if "feed_info.txt" in names:
        end = next(_rows(z, "feed_info.txt"), {}).get("feed_end_date")
        if end:
            return _date(end)
    ends = [_date(r["end_date"]) for r in _rows(z, "calendar.txt")] if "calendar.txt" in names else []
    ends += [_date(r["date"]) for r in _rows(z, "calendar_dates.txt") if r["exception_type"] == "1"] if "calendar_dates.txt" in names else []
    return max(ends) if ends else None


def build(z, today, n_days):
    # Days past the feed's end (the yearly timetable change in December) have no trains in it yet:
    # leave them out, so the site says "no timetable for this day yet" instead of "no train".
    end = feed_end(z)
    days = [d for d in (today + dt.timedelta(days=i) for i in range(n_days)) if end is None or d <= end]
    runs = service_days(z, days)

    agencies, agency_ix = [], {}
    agency_of = {}
    for r in _rows(z, "agency.txt"):
        short = AGENCY_SHORT.get(r["agency_name"], r["agency_name"])
        if short not in agency_ix:
            agency_ix[short] = len(agencies)
            agencies.append(short)
        agency_of[r["agency_id"]] = agency_ix[short]
    routes = {r["route_id"]: r for r in _rows(z, "routes.txt")}

    services, service_ix = [], {}
    trips = {}
    for r in _rows(z, "trips.txt"):
        dates = runs.get(r["service_id"])
        if not dates:
            continue
        mask = "".join("1" if d in dates else "0" for d in days)
        if mask not in service_ix:
            service_ix[mask] = len(services)
            services.append(mask)
        route = routes.get(r["route_id"], {})
        label = (route.get("route_short_name") or r.get("trip_short_name") or "").strip()
        name = (route.get("route_long_name") or "").strip()
        trips[r["trip_id"]] = dict(label=label, name=name, agency=agency_of.get(route.get("agency_id"), 0), service=service_ix[mask], stops=[])

    station_rows = {r["stop_id"]: r for r in _rows(z, "stops.txt")}
    for r in _rows(z, "stop_times.txt"):
        t = trips.get(r["trip_id"])
        if t is None:
            continue
        # A train that neither picks up nor sets down here only passes through.
        if r.get("pickup_type") == "1" and r.get("drop_off_type") == "1":
            continue
        arr = r["arrival_time"] or r["departure_time"]
        dep = r["departure_time"] or r["arrival_time"]
        t["stops"].append((int(r["stop_sequence"]), r["stop_id"], _minutes(arr), _minutes(dep)))

    stations, station_ix = [], {}
    out = []
    for t in trips.values():
        seq = sorted(t["stops"])
        if len(seq) < 2:
            continue
        flat = []
        for _n, sid, arr, dep in seq:
            if sid not in station_ix:
                s = station_rows[sid]
                station_ix[sid] = len(stations)
                stations.append([s["stop_name"].strip(), round(float(s["stop_lat"]), 5), round(float(s["stop_lon"]), 5)])
            flat += [station_ix[sid], arr, dep]
        out.append([t["label"], t["name"], t["agency"], t["service"], flat])
    out.sort(key=lambda t: (t[4][2], t[0]))

    feed = next(_rows(z, "feed_info.txt"), {}) if "feed_info.txt" in z.namelist() else {}
    return dict(
        version=VERSION,
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        feed_version=feed.get("feed_version"),
        feed_end=feed.get("feed_end_date"),
        attribution="Cestovný poriadok: ŽSR, data.slovensko.sk (CC0)",
        days=[d.strftime("%Y%m%d") for d in days],
        agencies=agencies,
        stations=stations,
        services=services,
        trips=out,
    )


def write(root, data):
    out = Path(root) / "public" / "data" / "rail"
    out.mkdir(parents=True, exist_ok=True)
    head = {k: v for k, v in data.items() if k != "trips"}
    # One train per line, so the weekly re-run diffs line by line.
    body = ",\n".join(json.dumps(t, ensure_ascii=False, separators=(",", ":")) for t in data["trips"])
    text = json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1] + ',"trips":[\n' + body + "\n]}\n"
    (out / "timetable.json").write_text(text)
    return out / "timetable.json"


def http_get(url, timeout=120, tries=3, headers=None):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA} | (headers or {})), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # network trouble: retry, then let the caller decide
            last = e
            time.sleep(2 * (i + 1))
    raise last


def discover_urls(get=http_get):
    """Download addresses of the GTFS files ŽSR lists in the national catalogue, most recently updated dataset first.

    Each new yearly timetable is a new file with a new download id, so the id cannot be pinned."""
    query = f"""
    PREFIX dcat: <http://www.w3.org/ns/dcat#>
    PREFIX dct: <http://purl.org/dc/terms/>
    SELECT ?url ?mod WHERE {{
      ?ds a dcat:Dataset ; dct:publisher <{ZSR_PUBLISHER}> ; dcat:distribution ?dist .
      OPTIONAL {{ ?ds dct:modified ?mod }}
      ?dist dcat:downloadURL ?url ; dct:title ?title .
      FILTER(CONTAINS(LCASE(STR(?title)), "gtfs"))
    }} ORDER BY DESC(?mod) LIMIT 20"""
    raw = get(SPARQL_URL + "?" + urllib.parse.urlencode({"query": query}), timeout=60, headers={"Accept": "application/sparql-results+json"})
    rows = json.loads(raw)["results"]["bindings"]
    urls = []
    for row in rows:
        u = row["url"]["value"]
        if u.startswith("https://data.slovensko.sk/download?id=") and u not in urls:
            urls.append(u)
    return urls


def newest_feed(blobs):
    """The (url, blob) whose timetable runs latest (feed end, then feed version); ties keep the earlier one."""
    best, best_key = None, None
    for url, blob in blobs:
        try:
            with zipfile.ZipFile(io.BytesIO(blob)) as z:
                end = feed_end(z)
                version = next(_rows(z, "feed_info.txt"), {}).get("feed_version", "") if "feed_info.txt" in z.namelist() else ""
        except Exception as e:
            log(f"skipping {url}: not a usable GTFS zip ({e})")
            continue
        log(f"candidate {url}: timetable until {end}, version {version or '?'}")
        key = (end or dt.date.min, version)
        if best_key is None or key > best_key:
            best, best_key = (url, blob), key
    return best


def find_feed(get=http_get):
    """Download the newest ŽSR GTFS file listed in the catalogue; the fixed FEED_URL when that fails. Never raises
    because of discovery, so the weekly job keeps working."""
    try:
        urls = discover_urls(get)[:MAX_CANDIDATES]
        log(f"catalogue lists {len(urls)} GTFS file(s)")
        blobs = []
        for u in urls:
            try:
                blobs.append((u, get(u)))
            except Exception as e:
                log(f"could not download {u}: {e}")
        picked = newest_feed(blobs)
        if picked:
            log(f"using {picked[0]}")
            return picked[1]
        log("no usable file in the catalogue")
    except Exception as e:
        log(f"discovery failed ({type(e).__name__}: {e})")
    log(f"falling back to the fixed file {FEED_URL}")
    return get(FEED_URL)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtfs", help="local GTFS zip; downloaded from data.slovensko.sk when omitted")
    ap.add_argument("--root", default=".")
    ap.add_argument("--days", type=int, default=70)
    ap.add_argument("--today", help="YYYY-MM-DD, for tests")
    a = ap.parse_args(argv)
    if a.gtfs:
        blob = Path(a.gtfs).read_bytes()
    else:
        blob = find_feed()
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        data = build(z, today, a.days)
    if not data["trips"]:
        log("no trains in the feed for the coming days; keeping the old file")
        return 1
    if len(data["days"]) < 14:
        # Not an error: the site shows estimates for the days after. A newer feed is usually out by then.
        print(f"::warning::The train timetable ends on {data['days'][-1]}: look for the new yearly feed on data.slovensko.sk.")
    path = write(a.root, data)
    log(f"{len(data['trips'])} trains, {len(data['stations'])} stations, feed {data['feed_version']}, {path.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
