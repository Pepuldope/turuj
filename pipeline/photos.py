"""Photos for the places trips lead to, from Wikimedia Commons (free licences only).

Sources, best first:
1. the OSM object's `wikidata` main image (P18) or its `wikimedia_commons` file;
2. the lead image of its Wikipedia article (OSM `wikipedia` tag or Wikidata sitelink);
3. a photo taken within 1 km whose title names the place, found by location on
   Commons, skipping guideposts, maps and boards;
4. a photo from the place's Commons category (Wikidata P373);
5. for outdoor places still without one, any photo taken within 300 m ("area"),
   skipping signs, maps, streets and buildings;
6. last, a Mapillary street-level photo taken within 150 m and facing the place
   ("mapillary", CC BY-SA 4.0; needs MAPILLARY_TOKEN). Mapillary's image links
   expire, so these are downloaded once into public/photos/m/<id>.jpg (500 px).
data/photo-overrides.json blocks files that turned out wrong and picks files by hand.
The thumbnail address, author and licence go to public/data/photos.json, keyed by
the OSM object ("node/123"), with `via` saying which source matched. Places without
a free photo are left out; the site draws its own tile for them.

    python -m pipeline.photos            # reads public/data/trips/index.json
"""

import html
import io
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

UA = "Turuj photos (https://github.com/Pepuldope/turuj)"
INDEX = Path("public/data/trips/index.json")
OUT = Path("public/data/photos.json")
OVERRIDES = Path("data/photo-overrides.json")
# Photos matched by position or title go live only after someone has looked at them (Peter, 2026-11-21:
# Revín showed a street). CHECKED lists the files that passed; WAITING is what the last run found and held back.
CHECKED = Path("data/photo-checked.json")
WAITING = Path("data/photo-waiting.json")
# One of Wikimedia's standard thumbnail steps (others are re-rounded up to 960 px).
THUMB_W = 500
# Licences that allow use on the site with a credit line.
FREE = re.compile(r"^(cc0|cc[- ]by(-sa)?[- ]\d|public domain|pd)", re.I)


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def get_json(url, headers=None):
    for wait in (0, 3, 10, 30):
        time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA} | (headers or {}))
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:  # one failed batch must not stop the rest
            log(f"retry {url[:90]}…: {e}")
    return None


def osm_tags(ids):
    """Tags of OSM objects ("node/1", "way/2", ...) from the OSM API, in batches."""
    out = {}
    by_type = {}
    for i in ids:
        t, n = i.split("/")
        by_type.setdefault(t, []).append(n)
    def fetch(t, batch):
        body = get_json(f"https://api.openstreetmap.org/api/0.6/{t}s.json?{t}s={','.join(batch)}")
        time.sleep(1)
        if body is None and len(batch) > 1:
            # The API refuses the whole batch when one object was deleted since the trip data was
            # built: split it, so one gone node doesn't cost 149 places their wikidata tag.
            half = len(batch) // 2
            fetch(t, batch[:half])
            fetch(t, batch[half:])
            return
        for e in (body or {}).get("elements", []):
            out[f"{e['type']}/{e['id']}"] = e.get("tags", {})

    for t, nums in by_type.items():
        for k in range(0, len(nums), 150):
            fetch(t, nums[k : k + 150])
    return out


def wikidata_images(qids):
    """Main image file name (P18) and Commons category (P373) per Wikidata id."""
    images, cats = {}, {}
    qids = sorted(qids)
    for k in range(0, len(qids), 50):
        body = get_json("https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids="
                        + "|".join(qids[k : k + 50]))
        for q, e in (body or {}).get("entities", {}).items():
            for prop, out in (("P18", images), ("P373", cats)):
                for c in e.get("claims", {}).get(prop, []):
                    v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
                    if v:
                        out[q] = v
                        break
    return images, cats


def category_photos(cats):
    """Up to 3 photo files per Commons category, skipping guideposts, maps and boards."""
    out = {}
    for cat in sorted(cats):
        body = get_json("https://commons.wikimedia.org/w/api.php?action=query&format=json&list=categorymembers"
                        "&cmnamespace=6&cmtype=file&cmlimit=30&cmtitle=" + urllib.parse.quote("Category:" + cat))
        files = [m["title"].removeprefix("File:") for m in (body or {}).get("query", {}).get("categorymembers", [])]
        files = [f for f in files if not NOT_A_VIEW.search(f) and re.search(r"\.(jpe?g|png|webp)$", f, re.I)]
        if files:
            out[cat] = files[:3]
        time.sleep(0.1)
    return out


def wikipedia_images(titles):
    """Lead image file name per (lang, title), from Wikipedia's page images (free files only)."""
    out = {}
    by_lang = {}
    for lang, title in titles:
        by_lang.setdefault(lang, set()).add(title)
    for lang, ts in by_lang.items():
        ts = sorted(ts)
        for k in range(0, len(ts), 50):
            body = get_json(f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
                            "&prop=pageimages&piprop=name&pilicense=free&titles=" + urllib.parse.quote("|".join(ts[k : k + 50])))
            q = (body or {}).get("query", {})
            back = {}
            for n in q.get("normalized", []) + q.get("redirects", []):
                back[n["to"]] = back.get(n["from"], n["from"])
            for pg in q.get("pages", {}).values():
                if pg.get("pageimage"):
                    out[(lang, back.get(pg["title"], pg["title"]))] = pg["pageimage"]
    return out


def sitelinks(qids):
    """Wikipedia article (lang, title) per Wikidata id, Slovak first."""
    out = {}
    qids = sorted(qids)
    for k in range(0, len(qids), 50):
        body = get_json("https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&format=json"
                        "&sitefilter=skwiki|cswiki|enwiki|huwiki|plwiki|dewiki&ids=" + "|".join(qids[k : k + 50]))
        for q, e in (body or {}).get("entities", {}).items():
            links = e.get("sitelinks", {})
            for site in ("skwiki", "cswiki", "enwiki", "huwiki", "plwiki", "dewiki"):
                if site in links:
                    out[q] = (site.removesuffix("wiki"), links[site]["title"])
                    break
    return out


def plain(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))


# Words that say what a place is, not which one; a title sharing only these doesn't name it.
GENERIC = set("hrad hradu zrucanina zrucaniny vrch vrchol kopec jaskyna jaskyne pleso plesa vodopad vodopady chata chaty "
              "rozhladna vyhliadka vyhlad skala skaly dolina nad pod velky velka velke maly mala male stary stara nova novy "
              "sedlo vrchy hora hore hory horou".split())
# Photos at the place that aren't of it.
NOT_A_VIEW = re.compile(r"rozcestn|smerovn|guidepost|signpost|\bsign|tabul|tabuľ|\bmap|mapa|plan |plán|informa|"
                        r"\bdoska|plaque|\berb\b|coat of arms|logo|\binterior|toilet|parkovisk|parking|\.svg|\.pdf|\.tif|"
                        # 21 Nov photo re-check: masts, statues and memorials standing at the place.
                        r"vysiela[čc]|transmitter|\bsoch[ay]\b|statue|pomn[íi]k|pam[äa]tn[íi]k|monument", re.I)


def names_place(words, title):
    """Whether a file title names the place: each word of the name (4+ letters, not generic) starts a
    word of the title ("Kamzíka" still names Kamzík; words under 6 letters must match whole, so "hoľa"
    doesn't match "Holíč" nor "hol" "catholic"), and not as the spot a view is taken from ("Sitno z
    Tatárskej lúky" is a photo of Sitno)."""
    tokens = re.findall(r"[a-z0-9]+", plain(title))
    if not words or not tokens:
        return False
    for w in words:
        stem = w[:-2] if len(w) >= 6 else w  # Slovak endings: "Tlstej hore" / "Tlstá hora"
        at = [k for k, t in enumerate(tokens) if (t.startswith(stem) if len(w) >= 6 else t == w)]
        if not at:
            return False
        if all(k > 0 and tokens[k - 1] in ("z", "zo", "from", "od", "pohlad", "vyhlad") for k in at):
            return False
    return True


def near_photos(places):
    """Up to 3 Commons files taken within 1 km of each place whose title names it, nearest first."""
    out = {}
    for n, (i, name, lat, lon) in enumerate(places):
        body = get_json("https://commons.wikimedia.org/w/api.php?action=query&format=json&list=geosearch"
                        f"&gsnamespace=6&gslimit=50&gsradius=1000&gscoord={lat}|{lon}")
        words = [w for w in re.findall(r"[a-z]{4,}", plain(name)) if w not in GENERIC]
        ranked = []
        for g in (body or {}).get("query", {}).get("geosearch", []):
            title = g["title"].removeprefix("File:")
            if NOT_A_VIEW.search(title) or not re.search(r"\.(jpe?g|png|webp)$", title, re.I):
                continue
            # Only photos whose title names the place: unnamed ones nearby were often streets or signs.
            if names_place(words, title):
                ranked.append((g["dist"], title))
        if ranked:
            out[i] = [t for _, t in sorted(ranked)[:3]]
        if n % 200 == 0:
            log(f"near {n}/{len(places)}")
        time.sleep(0.1)
    return out


# Not the place itself: streets, buildings' insides, people, graves (the "area" source takes any title).
NOT_THE_PLACE = re.compile(r"ulica|street|námestie|namestie|square|interi|cintor|cemeter|hrob|grave|portrait|selfie|"
                           r"\bbus\b|autobus|vlak|train|stanica|station|kostol|church|pamätn|memorial", re.I)
# Close-ups and odd shots a 300 m search also finds (Peter 2026-10-22: a zoo lynx for a hill): animals,
# insects, plants seen up close, space photos, trains, people and events.
NOT_A_LANDSCAPE = re.compile(r"\bzoo\b|lynx|\brys\b|insect|hmyz|inaturalist|observation|beetle|butterfl|motýľ|\bbird|crystal|"
                             r"\bISS\d|view of earth|\bZSSK|\bfriends|turn[ée]|concert|koncert|portrét|\.png$", re.I)
# Kinds out in nature, where a photo taken right there almost always shows the place or its view.
# Sources that match a photo by where it was taken or what its title says, not by someone choosing it.
AUTO = ("near", "category", "area")
AREA_KINDS = {"vrchol", "vyhliadka", "vodopad", "roklina", "pleso", "jaskyna", "chata"}
AREA_M = 300


def area_photos(places):
    """For places nothing else found: up to 3 Commons photos taken within 300 m, whatever their title
    (outdoor kinds only, signs, maps, streets and buildings left out), nearest first."""
    out = {}
    for n, (i, lat, lon) in enumerate(places):
        body = get_json("https://commons.wikimedia.org/w/api.php?action=query&format=json&list=geosearch"
                        f"&gsnamespace=6&gslimit=30&gsradius={AREA_M}&gscoord={lat}|{lon}")
        ranked = []
        for g in (body or {}).get("query", {}).get("geosearch", []):
            title = g["title"].removeprefix("File:")
            if NOT_A_VIEW.search(title) or NOT_THE_PLACE.search(title) or NOT_A_LANDSCAPE.search(title) or not re.search(r"\.(jpe?g|png|webp)$", title, re.I):
                continue
            ranked.append((g["dist"], title))
        if ranked:
            out[i] = [t for _, t in sorted(ranked)[:3]]
        if n % 200 == 0:
            log(f"area {n}/{len(places)}")
        time.sleep(0.1)
    return out


MLY_DIR = Path("public/photos/m")
MLY_M = 150


def bearing(lat1, lon1, lat2, lon2):
    """Compass bearing in degrees from point 1 to point 2."""
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


# Faster than this between two shots of one sequence = taken from a car or bus (dashcam road
# views, Peter 2026-10-27: "quite shit photos"). Walkers and cyclists on paths stay below it.
WALK_KMH = 15


def from_a_vehicle(images):
    """The sequences in `images` whose consecutive shots moved faster than WALK_KMH."""
    by_seq = {}
    for im in images:
        g = (im.get("geometry") or {}).get("coordinates")
        if g and im.get("sequence") and im.get("captured_at") is not None:
            by_seq.setdefault(im["sequence"], []).append((im["captured_at"], g))
    fast = set()
    for seq, shots in by_seq.items():
        shots.sort()
        for (t0, a), (t1, b) in zip(shots, shots[1:]):
            dt = (t1 - t0) / 3_600_000  # captured_at is in milliseconds
            if dt <= 0:
                continue
            km = math.hypot((b[1] - a[1]) * 111.32, (b[0] - a[0]) * 111.32 * math.cos(math.radians(a[1])))
            if km / dt > WALK_KMH:
                fast.add(seq)
                break
    return fast


def mapillary_photos(places, token):
    """For places still without a photo: the best Mapillary image within 150 m, downloaded and
    shrunk to 500 px. Best = facing the place (when not standing right on it), then nearest, then newest."""
    from PIL import Image  # only this source needs it (pip install Pillow in .github/workflows/photos.yml)

    MLY_DIR.mkdir(parents=True, exist_ok=True)
    auth = {"Authorization": f"OAuth {token}"}  # in a header, so the token never shows in a logged URL
    out = {}
    seen = kept = 0
    for n, (i, lat, lon) in enumerate(places):
        dlat = MLY_M / 111_320
        dlon = MLY_M / (111_320 * math.cos(math.radians(lat)))
        body = get_json("https://graph.mapillary.com/images?fields=id,geometry,computed_geometry,compass_angle,captured_at,creator,is_pano,sequence"
                        f"&bbox={lon - dlon},{lat - dlat},{lon + dlon},{lat + dlat}&limit=100", auth)
        ranked = []
        images = (body or {}).get("data", [])
        moving = from_a_vehicle(images)
        for im in images:
            seen += 1
            g = (im.get("computed_geometry") or im.get("geometry") or {}).get("coordinates")
            if not g or im.get("is_pano") or im.get("sequence") in moving:
                continue
            dy = (g[1] - lat) * 111_320
            dx = (g[0] - lon) * 111_320 * math.cos(math.radians(lat))
            dist = math.hypot(dx, dy)
            if dist > MLY_M:
                continue
            # Off by more than 60 degrees from the place = looking elsewhere (a road, a car park).
            off = abs((im.get("compass_angle", 0) - bearing(g[1], g[0], lat, lon) + 180) % 360 - 180)
            if dist > 25 and off > 60:
                continue
            kept += 1
            ranked.append((dist > 25 and off > 30, round(dist / 25), -(im.get("captured_at") or 0), im))
        for *_, im in sorted(ranked, key=lambda r: r[:3])[:1]:
            f = MLY_DIR / f"{im['id']}.jpg"
            if not f.exists():
                meta = get_json(f"https://graph.mapillary.com/{im['id']}?fields=thumb_1024_url", auth)
                if not meta or not meta.get("thumb_1024_url"):
                    continue
                try:
                    with urllib.request.urlopen(urllib.request.Request(meta["thumb_1024_url"], headers={"User-Agent": UA}), timeout=60) as r:
                        img = Image.open(io.BytesIO(r.read())).convert("RGB")
                except Exception as e:
                    log(f"mapillary {im['id']}: {e}")
                    continue
                img.thumbnail((THUMB_W, THUMB_W * 2))
                img.save(f, "JPEG", quality=78, optimize=True, progressive=True)
            w, h = Image.open(f).size
            user = (im.get("creator") or {}).get("username") or "Mapillary"
            out[i] = dict(url=f"/photos/m/{im['id']}.jpg", w=w, h=h, author=user, license="CC BY-SA 4.0",
                          license_url="https://creativecommons.org/licenses/by-sa/4.0/",
                          page=f"https://www.mapillary.com/app/?pKey={im['id']}")
        if n % 200 == 0:
            log(f"mapillary {n}/{len(places)}: {seen} images seen, {kept} usable, {len(out)} places")
    return out


def strip_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def commons_info(files):
    """Thumbnail, size, author and licence per Commons file name (without "File:")."""
    out = {}
    files = sorted(files)
    for k in range(0, len(files), 50):
        titles = "|".join("File:" + f for f in files[k : k + 50])
        body = get_json("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
                        f"&iiprop=url|size|extmetadata&iiurlwidth={THUMB_W}&titles=" + urllib.parse.quote(titles))
        if not body:
            continue
        q = body.get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for p in q.get("pages", {}).values():
            ii = (p.get("imageinfo") or [None])[0]
            if not ii:
                continue
            meta = ii.get("extmetadata", {})
            lic = strip_html(meta.get("LicenseShortName", {}).get("value"))
            if not FREE.match(lic) or ii.get("width", 0) < 400:
                continue
            name = back.get(p["title"], p["title"]).removeprefix("File:")
            # Square tiles crop hard: skip panoramas and very tall shots.
            ratio = ii["width"] / max(ii["height"], 1)
            if not 0.6 <= ratio <= 2.2:
                continue
            author = credit(meta)
            # CC BY and BY-SA need the author's name: a file without one can't be shown.
            if not author and not re.match(r"cc0|public domain|pd", lic, re.I):
                continue
            out[name] = dict(
                url=(ii.get("thumburl") or ii["url"]).split("?")[0],
                w=ii.get("thumbwidth") or ii["width"],
                h=ii.get("thumbheight") or ii["height"],
                author=author or "neznámy autor",
                license=lic,
                license_url=strip_html(meta.get("LicenseUrl", {}).get("value")) or None,
                page=ii.get("descriptionurl"),
                cats=strip_html(meta.get("Categories", {}).get("value")),
            )
    return out


# A photo of something else that happens to be filed or taken at the place: animals, plants, people,
# vehicles, events, or pictures from space. Checked against the file's title and its Commons categories.
OFF_TOPIC = re.compile(r"animal|mammal|\bbirds?\b|insect|beetle|butterfl|moth|spider|reptile|amphibian|\bfish|felidae|lynx|puma|"
                       r"cougar|\bzoos?\b|fauna|fungi|mushroom|flower|plantae|\bplants?\b|taxon|inaturalist|observation \d|"
                       r"\biss\d|iss expedition|from space|view of earth|astronaut|\bpeople\b|\bmen\b|\bwomen\b|portrait|"
                       r"selfie|musician|concert|festival|locomotive|railway vehicle|\btrains?\b|\bbus(es)?\b|\bcars?\b|aircraft|"
                       r"kultúrny dom|friends|"
                       # Slovak and Latin names miss the English words above (Peter 15 Nov: a nuthatch, "Brhlík lesný
                       # Sitta europaea", was Šarišský hrad's photo). Whole words only: many places are named after animals.
                       r"\bvt[áa]k(y|ov)?\b|\baves\b|passeriformes|brhl[íi]k|s[ýy]kork|\bďate[ľl]|\bdrozd\b|\bpinka\b|"
                       r"\bmot[ýy]ľ|\bchrob[áa]k|\bpav[úu]k\b|\bhub(a|y)\b|\bhr[íi]b\b|\brastlin|\bvstava[čc]|\bponiklec|"
                       r"lišajn[íi]k|\bjašter|\bužovk|vretenic", re.I)
# For photos matched by place rather than chosen for it (near, category, area): buildings and town
# scenes are usually not the trip's goal either.
NOT_OUTDOORS = re.compile(r"church|chapel|chrám|\bkostol(a|e)?\b|\bkl[aá][sš]tor(a|e)?\b|monaster|interior|cemeter|calvar|kalvári|"
                          r"\bhouses?\b|street|windmill|veterný mlyn|"
                          # 15 Nov photo sweep: spring wells filed by coordinates, cave sketches, maps, sledging, pilgrimages, hotels.
                          r"prameň v k\.\s?ú\.|náčrt|relief map|sledg|sánkov|\bpouť|\bpúť|\bhotel\b", re.I)


def off_topic(info, src):
    """Whether a Commons file shows something other than the place (title and categories)."""
    text = info.get("page", "") + " " + info.get("cats", "")
    text = urllib.parse.unquote(text).replace("_", " ")
    if OFF_TOPIC.search(text):
        return True
    return src in ("near", "category", "area") and bool(NOT_OUTDOORS.search(text))


def file_of(photo):
    """The Commons file name of a photos.json entry, as the hand lists spell it."""
    return urllib.parse.unquote(photo.get("page", "").rsplit("File:", 1)[-1]).replace("_", " ")


def choose(cands, info, checked):
    """The first usable candidate of one place, and the automatic matches held back on the way.
    cands: [(file, source)], best first. A match by position or title (AUTO) is used only when its
    file is in `checked`; otherwise it waits for a look. Returns (photo or None, [(file, source)])."""
    held = []
    for f, src in cands:
        name = f.replace("_", " ")
        meta = info.get(name)
        if not meta or (src != "picked" and off_topic(meta, src)):
            continue
        if src in AUTO and name not in checked:
            held.append((name, src))
            continue
        return {k: v for k, v in meta.items() if k != "cats"} | {"via": src}, held
    return None, held


# Text some authors put in the Artist field instead of a name.
NOT_A_NAME = re.compile(r"^(i would|please|this (image|file|photo)|when reusing|if you use|own work|unknown|anonym)", re.I)


def credit(meta):
    """The author line a CC licence asks for: the file's own attribution text, else the author,
    cut at a word (never mid-word) when long; "" when there is no usable name."""
    for key in ("Attribution", "Artist"):
        text = strip_html(meta.get(key, {}).get("value"))
        # "This image is a work by Mercy. When reusing, please credit me as: Mercy from Wikimedia" -> what they asked for.
        asked = re.search(r"credit (?:me|the author) as:?\s*(.+)$", text, re.I)
        if asked:
            text = asked.group(1).strip()
        # Commons' own filler for files without an Artist field:
        # "No machine-readable author provided. Rado Bahna~commonswiki assumed (based on copyright claims)." -> "Rado Bahna".
        guessed = re.match(r"no machine-readable author provided\.\s*(.+?)\s+assumed\b.*$", text, re.I)
        if guessed:
            text = guessed.group(1).strip()
        text = re.sub(r"~\w*wiki\b", "", text).strip()
        if text and not NOT_A_NAME.match(text):
            return text if len(text) <= 100 else text[:100].rsplit(" ", 1)[0] + "…"
    return ""


def main():
    trips = json.loads(INDEX.read_text())["trips"]
    if os.environ.get("PHOTOS_ONLY") == "mapillary":
        return mapillary_only(trips)
    # Keyed by the OSM object; hand-made trips without one by "trip/<slug>".
    dest = {t["destination"].get("osm") or f"trip/{t['slug']}": t["destination"] for t in trips}
    ids = sorted(dest)
    log(f"{len(ids)} places")
    tags = osm_tags([i for i in ids if not i.startswith("trip/")])
    qid = {i: t["wikidata"].split(";")[0].strip() for i, t in tags.items() if re.fullmatch(r"Q\d+", t.get("wikidata", "").split(";")[0].strip())}
    p18, p373 = wikidata_images(set(qid.values()))
    # Candidate files per place, best source first.
    cands = {i: [] for i in ids}
    via = {}
    for i in ids:
        f = p18.get(qid.get(i, ""))
        c = tags.get(i, {}).get("wikimedia_commons", "")
        if not f and c.startswith("File:"):
            f = c.removeprefix("File:")
        if f:
            cands[i].append((f, "wikidata"))
    article = {}
    links = sitelinks({qid[i] for i in ids if i in qid})
    for i in ids:
        w = tags.get(i, {}).get("wikipedia", "")
        if ":" in w:
            lang, title = w.split(":", 1)
            article[i] = (lang.strip(), title.strip())
        elif qid.get(i) in links:
            article[i] = links[qid[i]]
    lead = wikipedia_images(set(article.values()))
    for i, a in article.items():
        if a in lead:
            cands[i].append((lead[a], "wikipedia"))
    near = near_photos([(i, dest[i]["name"], dest[i]["location"]["lat"], dest[i]["location"]["lon"]) for i in ids])
    for i, fs in near.items():
        cands[i] += [(f, "near") for f in fs]
    in_cat = category_photos({p373[qid[i]] for i in ids if qid.get(i) in p373})
    for i in ids:
        cands[i] += [(f, "category") for f in in_cat.get(p373.get(qid.get(i, ""), ""), [])]
    # Still nothing (most small peaks): a photo taken right at the place (Peter, 2026-10-22: every trip a photo).
    bare = [(i, dest[i]["location"]["lat"], dest[i]["location"]["lon"]) for i in ids if not cands[i] and dest[i].get("kind") in AREA_KINDS]
    for i, fs in area_photos(bare).items():
        cands[i] += [(f, "area") for f in fs]
    # Hand fixes: a picked file goes first, blocked files are dropped.
    fix = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    blocked = {f.replace("_", " ") for f in fix.get("block", [])}
    for i, f in fix.get("pick", {}).items():
        if i in cands:
            cands[i].insert(0, (f, "picked"))
    # Places where a photo matched by position or name was looked at and never shows the place (a hill
    # among city streets, a hill-climb road full of racing cars): only Wikidata, Wikipedia or a hand pick.
    no_auto = set(fix.get("no_auto", []))
    for i in cands:
        cands[i] = [(f, src) for f, src in cands[i]
                    if f.replace("_", " ") not in blocked and not (i in no_auto and src in AUTO)]
    info = commons_info({f.replace("_", " ") for fs in cands.values() for f, _ in fs})
    checked = {f.replace("_", " ") for f in (json.loads(CHECKED.read_text()).get("ok", []) if CHECKED.exists() else [])}
    photos, waiting = {}, {}
    for i, fs in cands.items():
        photo, held = choose(fs, info, checked)
        if photo:
            photos[i] = photo
        elif held:
            waiting[i] = dict(name=dest[i]["name"], kind=dest[i].get("kind", ""),
                              files=[dict(file=f, via=src, url=info[f]["url"]) for f, src in held[:3]])
    # Last resort: a street-level photo from Mapillary (Peter, 2026-10-25).
    token = os.environ.get("MAPILLARY_TOKEN", "")
    if token:
        rest = [(i, dest[i]["location"]["lat"], dest[i]["location"]["lon"]) for i in ids if i not in photos and i not in fix.get("no_mapillary", [])]
        for i, p in mapillary_photos(rest, token).items():
            photos[i] = p | {"via": "mapillary"}
    else:
        log("no MAPILLARY_TOKEN: Mapillary skipped")
    # A bad hour at Commons or Wikidata returns little: keep last week's file rather than blank tiles.
    old = json.loads(OUT.read_text()).get("photos", {}) if OUT.exists() else {}
    before = len(old)
    # A place that had a photo keeps it when this run found none (Commons search returned less,
    # or Mapillary was skipped without its token). Blocked files and Mapillary photos whose
    # download is gone still drop out.
    kept = 0
    for i in ids:
        p = old.get(i)
        if i in photos or not p:
            continue
        if p.get("via") == "mapillary":
            if i in fix.get("no_mapillary", []) or not (MLY_DIR / p["url"].rsplit("/", 1)[1]).exists():
                continue
        elif file_of(p) in blocked:
            continue
        elif p.get("via") in AUTO and (i in no_auto or file_of(p) not in checked):
            continue
        photos[i] = p
        kept += 1
    log(f"kept {kept} photos from last time that this run did not find again")
    if len(photos) < 0.7 * before:
        log(f"only {len(photos)} photos against {before} last time: keeping the old file")
        return 1
    # Downloaded Mapillary files no place uses any more.
    used = {p["url"].rsplit("/", 1)[1] for p in photos.values() if p["via"] == "mapillary"}
    for f in MLY_DIR.glob("*.jpg"):
        if f.name not in used:
            f.unlink()
    OUT.write_text(json.dumps(dict(
        generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        source="Wikimedia Commons via Wikidata, Wikipedia and OpenStreetMap; Mapillary",
        photos=dict(sorted(photos.items())),
    ), ensure_ascii=False, separators=(",", ":")) + "\n")
    # No date inside: the file changes only when the list does. A place that kept last week's photo isn't waiting.
    waiting = {i: w for i, w in sorted(waiting.items()) if i not in photos}
    WAITING.write_text(json.dumps(dict(
        _comment="Automatic photo matches held back until looked at (pipeline/photos.py). Good ones go to "
                 "data/photo-checked.json, bad ones to block or no_auto in data/photo-overrides.json.",
        waiting=waiting), ensure_ascii=False, indent=1) + "\n")
    log(f"{len(waiting)} places have an automatic match waiting for a look")
    counts = {s: sum(p["via"] == s for p in photos.values()) for s in ("picked", "wikidata", "wikipedia", "near", "category", "area", "mapillary")}
    log(f"tags {len(tags)}, wikidata {len(qid)}, articles {len(article)}, free photo {len(photos)} of {len(ids)} places {counts}")
    return 0


def mapillary_only(trips):
    """Only the Mapillary step, on top of the current photos.json (a quick rerun after changing it)."""
    data = json.loads(OUT.read_text())
    photos = {i: p for i, p in data["photos"].items() if p.get("via") != "mapillary"}
    dest = {t["destination"].get("osm") or f"trip/{t['slug']}": t["destination"] for t in trips}
    fix = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
    rest = [(i, d["location"]["lat"], d["location"]["lon"]) for i, d in sorted(dest.items()) if i not in photos and i not in fix.get("no_mapillary", [])]
    if not os.environ.get("MAPILLARY_TOKEN"):
        log("no MAPILLARY_TOKEN: nothing to do")
        return 0
    for i, p in mapillary_photos(rest, os.environ["MAPILLARY_TOKEN"]).items():
        photos[i] = p | {"via": "mapillary"}
    used = {p["url"].rsplit("/", 1)[1] for p in photos.values() if p["via"] == "mapillary"}
    for f in MLY_DIR.glob("*.jpg"):
        if f.name not in used:
            f.unlink()
    data["photos"] = dict(sorted(photos.items()))
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    log(f"mapillary: {len(used)} places")
    return 0


if __name__ == "__main__":
    sys.exit(main())
