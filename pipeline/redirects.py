"""Old trip addresses that still lead somewhere: data/slug-redirects.json, `{"version": 1, "redirects": {old: new}}`.

A slug changes (a typo fixed, a collision suffix redone) or is retired (a variant that is no longer
a route of its place); the page of the old address answers with a permanent redirect to the new one
(components/TripRoute.tsx, lib/slugRedirects.ts) instead of a 404. update() runs after every build:

- a slug that was published last time and is gone now gets an entry: to the slug it was renamed to,
  else (a retired variant) to the place it was a route of;
- chains are followed (a -> b -> c becomes a -> c), and an entry is dropped when its target is not a
  live trip, so a redirect never leads to a 404;
- a live slug never redirects: the page that exists wins.
"""

import json
from pathlib import Path

FILE = Path("data") / "slug-redirects.json"


def previous(root):
    """The slugs published last time, `{slug: variant_of or None}`, read before this build overwrites them."""
    root = Path(root)
    out = {}
    for rel, key in (("public/data/trips/index.json", "trips"), ("data/trip-variants.json", "trips")):
        f = root / rel
        if f.exists():
            for t in json.loads(f.read_text()).get(key, []):
                out[t["slug"]] = t.get("variant_of")
    return out


def load(root):
    f = Path(root) / FILE
    return json.loads(f.read_text()).get("redirects", {}) if f.exists() else {}


def update(table, prev, live, renames):
    """New redirect table. `table` is the old one, `prev` the slugs published last time ({slug: variant_of}),
    `live` the slugs of this build, `renames` {old slug: new slug} for slugs this build changed."""
    out = dict(table)
    for old, variant_of in prev.items():
        if old in live:
            continue
        target = renames.get(old) or variant_of
        if target and target != old:
            out[old] = target
    final = {}
    for old, target in out.items():
        if old in live:
            continue
        seen = {old}
        while target not in live and target in out and target not in seen:
            seen.add(target)
            target = out[target]
        if target in live:
            final[old] = target
    return dict(sorted(final.items()))


def write(root, table):
    f = Path(root) / FILE
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(dict(version=1, redirects=table), ensure_ascii=False, indent=1) + "\n")


def apply_renames(slugs, renames):
    """Config `slug_renames:` {old: new}: re-point the pinned slugs of a place, and of its other routes
    (`<old>-<start>` becomes `<new>-<start>`), in the slug table before the build."""
    for k, v in slugs.items():
        for old, new in renames.items():
            if v == old:
                slugs[k] = new
                break
            if v.startswith(old + "-"):
                slugs[k] = new + v[len(old):]
                break
    return slugs
