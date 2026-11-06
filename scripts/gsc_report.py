"""Google Search Console report: search performance, sitemaps, URL inspection.

Run by .github/workflows/gsc-report.yml. Writes JSON files into --out; the
workflow encrypts that directory with age before anything leaves the runner.

PRIVACY: this repository is public. Nothing from GSC responses (queries, URLs,
metrics) may be printed. Logs carry only counts and HTTP status codes.

Auth: service-account JSON from the GSC_JSON env var (never printed or written).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

SITE = "sc-domain:turuj.sk"
SITEMAP_INDEX = "https://turuj.sk/sitemap.xml"
API = "https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aturuj.sk"
INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
PAGE = 25000
MAX_INSPECT = 600
SAMPLE_SITEMAP = 250
WORKERS = 8
MIN_GAP = 0.5  # seconds each worker waits between calls: at most ~960/min only if calls were instant; real calls take seconds
BUDGET = 20 * 60  # seconds for the whole inspection phase

stats = {"rows": {}, "inspections": 0, "errors": 0, "status_codes": {}}


def log(msg: str) -> None:
    print(msg, flush=True)


def count_status(code) -> None:
    k = str(code)
    stats["status_codes"][k] = stats["status_codes"].get(k, 0) + 1


class Client:
    def __init__(self) -> None:
        info = json.loads(os.environ["GSC_JSON"])
        self.creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
        self.creds.refresh(Request())
        self.session = requests.Session()

    def headers(self) -> dict:
        if not self.creds.valid:
            self.creds.refresh(Request())
        return {"Authorization": f"Bearer {self.creds.token}"}

    def post(self, url: str, body: dict, timeout: int = 60):
        for attempt in range(4):
            r = self.session.post(url, json=body, headers=self.headers(), timeout=timeout)
            count_status(r.status_code)
            if r.status_code in (429, 500, 503) and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            return r
        return r

    def get(self, url: str):
        r = self.session.get(url, headers=self.headers(), timeout=60)
        count_status(r.status_code)
        return r


def query(c: Client, name: str, dims: list[str], days: int, extra: dict | None = None) -> list:
    end = date.today() - timedelta(days=2)  # final data lags ~2 days
    start = end - timedelta(days=days - 1)
    rows: list = []
    offset = 0
    while True:
        body = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": dims,
            "rowLimit": PAGE,
            "startRow": offset,
            "dataState": "final",
        }
        if extra:
            body.update(extra)
        r = c.post(f"{API}/searchAnalytics/query", body)
        if r.status_code != 200:
            log(f"{name}: HTTP {r.status_code}")
            stats["errors"] += 1
            break
        got = r.json().get("rows", [])
        rows.extend(got)
        if len(got) < PAGE:
            break
        offset += PAGE
    stats["rows"][name] = len(rows)
    log(f"{name}: {len(rows)} rows")
    return rows


def sitemap_urls() -> list[str]:
    def locs(url: str) -> list[str]:
        try:
            r = requests.get(url, timeout=60)
            if r.status_code != 200:
                return []
            return [e.text.strip() for e in ET.fromstring(r.content).iter() if e.tag.endswith("}loc") and e.text]
        except Exception:
            return []

    top = locs(SITEMAP_INDEX)
    urls: list[str] = []
    for u in top:
        if u.endswith(".xml"):
            urls.extend(locs(u))
        else:
            urls.append(u)
    return urls


def even_sample(items: list[str], n: int) -> list[str]:
    if len(items) <= n:
        return items
    step = len(items) / n
    return [items[int(i * step)] for i in range(n)]


def pick_sample(urls: list[str]) -> list[str]:
    """Deterministic, even sample that keeps /trasa/, town pages and the rest in proportion."""
    groups: dict[str, list[str]] = {}
    for u in sorted(set(urls)):
        path = re.sub(r"^/en(?=/|$)", "", u.split("turuj.sk", 1)[-1])
        key = "trasa" if path.startswith("/trasa/") else "mesto" if path.startswith("/vylety-z") else "other"
        groups.setdefault(key, []).append(u)
    total = sum(len(v) for v in groups.values()) or 1
    out: list[str] = []
    for key, v in groups.items():
        out.extend(even_sample(v, max(5, round(SAMPLE_SITEMAP * len(v) / total))))
    return out[:SAMPLE_SITEMAP + 30]


def inspect_one(c: Client, u: str) -> tuple[dict, bool]:
    """One URL Inspection call; returns (record, quota_hit). Never logs response data."""
    try:
        r = c.post(INSPECT, {"inspectionUrl": u, "siteUrl": SITE}, timeout=45)
    except requests.RequestException:
        return {"url": u, "error": "request failed"}, False
    if r.status_code == 429:
        return {"url": u, "error": "quota"}, True
    if r.status_code != 200:
        return {"url": u, "error": f"http {r.status_code}"}, False
    res = r.json().get("inspectionResult", {}).get("indexStatusResult", {})
    return {
        "url": u,
        "verdict": res.get("verdict"),
        "coverageState": res.get("coverageState"),
        "robotsTxtState": res.get("robotsTxtState"),
        "indexingState": res.get("indexingState"),
        "pageFetchState": res.get("pageFetchState"),
        "googleCanonical": res.get("googleCanonical"),
        "userCanonical": res.get("userCanonical"),
        "lastCrawlTime": res.get("lastCrawlTime"),
    }, False


def inspect(c: Client, urls: list[str]) -> list:
    """Calls take several seconds each, so run a few at once (still far under 600/min)."""
    results: list = []
    t0 = time.time()
    stop = threading.Event()
    lock = threading.Lock()
    it = iter(urls[:MAX_INSPECT])

    def worker() -> None:
        while not stop.is_set() and time.time() - t0 <= BUDGET:
            with lock:
                u = next(it, None)
            if u is None:
                return
            rec, quota = inspect_one(c, u)
            with lock:
                results.append(rec)
                if "error" in rec:
                    stats["errors"] += 1
                else:
                    stats["inspections"] += 1
                if len(results) % 50 == 0:
                    log(f"inspection progress: {len(results)} tried, {int(time.time() - t0)}s")
            if quota:
                stop.set()
            time.sleep(MIN_GAP)

    threads = [threading.Thread(target=worker) for _ in range(WORKERS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    log(f"inspections: {stats['inspections']} done, quota_hit={stop.is_set()}")
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--days", type=int, default=90)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    def save(name: str, data) -> None:
        (out / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False))

    c = Client()
    d = a.days
    save("queries_28d", query(c, "queries_28d", ["query"], 28))
    save(f"queries_{d}d", query(c, f"queries_{d}d", ["query"], d))
    save("pages_28d", query(c, "pages_28d", ["page"], 28))
    pages = query(c, f"pages_{d}d", ["page"], d)
    save(f"pages_{d}d", pages)
    save(f"query_page_{d}d", query(c, f"query_page_{d}d", ["query", "page"], d))
    save(f"daily_{d}d", query(c, f"daily_{d}d", ["date"], d))
    save("device_28d", query(c, "device_28d", ["device"], 28))
    save("country_28d", query(c, "country_28d", ["country"], 28))

    r = c.get(f"{API}/sitemaps")
    if r.status_code == 200:
        sm = r.json().get("sitemap", [])
        save("sitemaps", sm)
        stats["rows"]["sitemaps"] = len(sm)
        log(f"sitemaps: {len(sm)} entries")
    else:
        log(f"sitemaps: HTTP {r.status_code}")
        stats["errors"] += 1

    # Top pages by impressions first (all of them when they fit), then the sitemap sample.
    impressed = [row["keys"][0] for row in sorted(pages, key=lambda r: -r.get("impressions", 0))]
    sample = pick_sample(sitemap_urls())
    log(f"sitemap sample: {len(sample)} urls")
    room = max(MAX_INSPECT - len(sample), 100)
    todo = list(dict.fromkeys(impressed[:room] + sample))[:MAX_INSPECT]
    log(f"inspection queue: {len(todo)} urls")
    save("inspection", inspect(c, todo))

    save("run_stats", stats)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write("### GSC report (counts only; data is in the encrypted artifact)\n\n")
            f.write("| dataset | rows |\n|---|---|\n")
            for k, v in stats["rows"].items():
                f.write(f"| {k} | {v} |\n")
            f.write(f"\nInspections done: {stats['inspections']}. Errors: {stats['errors']}.\n")
    log(f"errors: {stats['errors']}; http: {stats['status_codes']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
