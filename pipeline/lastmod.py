"""The day each trip last changed: data/trip-lastmod.json, `{"version": 1, "dates": {slug: "YYYY-MM-DD"}}`.

The sitemap's `lastModified` has to be honest (a search engine stops trusting a date that moves on
every deploy), so a trip's date moves only when its own file changes. snapshot() runs before
publish.write() deletes and rewrites the trip files, update() after the new ones are in place.
"""

import hashlib
import json
from pathlib import Path

FILE = Path("data") / "trip-lastmod.json"
TRIPS = Path("public") / "data" / "trips"
NOT_TRIPS = ("index.json", "list.json")


def snapshot(root):
    """A hash of every trip file as it is now, `{slug: sha1}`, read before the build overwrites them."""
    out = {}
    d = Path(root) / TRIPS
    if d.exists():
        for f in d.glob("*.json"):
            if f.name not in NOT_TRIPS:
                out[f.stem] = hashlib.sha1(f.read_bytes()).hexdigest()
    return out


def load(root):
    f = Path(root) / FILE
    return json.loads(f.read_text()).get("dates", {}) if f.exists() else {}


def update(dates, before, after, today):
    """New dates. `dates` is the old table, `before` and `after` the file hashes ({slug: sha1}) from
    before and after this build, `today` "YYYY-MM-DD". A trip that is new or whose file differs gets
    today; the rest keep their date (today when they have none); trips that are gone are dropped."""
    out = {}
    for slug, digest in after.items():
        changed = before.get(slug) != digest
        out[slug] = today if changed or slug not in dates else dates[slug]
    return dict(sorted(out.items()))


def write(root, table):
    f = Path(root) / FILE
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(dict(version=1, dates=table), ensure_ascii=False, indent=1) + "\n")
