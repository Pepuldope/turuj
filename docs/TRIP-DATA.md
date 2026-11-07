# Trip data (schema v1)

Túruj's trips are plain static files generated from OpenStreetMap by a weekly
GitHub Actions job (`.github/workflows/trips.yml`, code in `pipeline/`). Every
destination near a marked trail that makes a good day trip is kept (2,131 places
with 6,463 routes on 2026-10-16; no per-region cap). The trip files are static assets in `public/data`, not
part of the site's code, so their number never counts against Cloudflare's Worker
size limit. Types: `lib/tripSchema.ts`. Server reads: `lib/tripFiles.ts` (ASSETS
binding on Cloudflare, the disk elsewhere). Small bundled data: `lib/trips.ts`.

| File | What | Written by |
|---|---|---|
| `public/data/trips/index.json` | `TripIndex`: the main route of every place as a `TripSummary` (home, sitemap, API, database load) | pipeline |
| `data/trip-variants.json` | The other routes of each place, same shape (database load only; the site never reads it, so pages stay light) | pipeline |
| `public/data/trips/list.json` | `TripList`: every main route (as in the index) without description and OSM ids; the home page fetches it | pipeline |
| `public/data/trips/<slug>.json` | `TripDetail`: summary + path, marking colours, other parking/stops, POIs | pipeline |
| `public/data/drive/<town>.json` | `TownDriveFile`: car minutes and km from one of ~140 towns to every main route's parking | pipeline (OSRM) |
| `public/data/map/meta.json`, `overview.json`, `c/<ix>_<iy>.json` | Trip lines for the home map: a simplified overview for zoomed-out views and detailed lines per grid cell, so the map loads only the part in view (`pipeline/maplines.py`) | pipeline |
| `data/towns.json` | `Towns`: the towns of the drive table (bundled, small) | pipeline |
| `public/gpx/<main slug>.gpx` | full-resolution GPX of every route to a place, main route first, each `<trk>` with its trip's slug in `<desc>`; a trip's `gpx_url` is `/gpx/<main slug>.gpx`, or `…#<slug>` for another route | pipeline |
| `data/slug-redirects.json` | `{redirects: {old slug: new slug}}`: slugs that changed or routes that were retired; the trip page answers them with a permanent redirect to a trip that exists (`lib/slugRedirects.ts`, `pipeline/redirects.py`) | pipeline |
| `data/closure-rules.json` | `ClosureRules`: seasonal and one-off closures, each with an official source and check date | by hand |
| `data/fee-rules.json` | `FeeRules`: entry fees OSM doesn't carry, each with a source | by hand |
| `data/pipeline-report.md` | counts, regressions against the 10 hand-picked trips, unresolved rule names | pipeline |

## What a trip is

A walk from a **start** (a KST guidepost with public parking or a stop nearby; a guidepost that is only a junction or a walking time, "Odbočka …", "Rázcestie …", "… 8 min.", is named by the nearest named car park, stop or village instead, and keeps its own name in `start.guidepost`) to a
**destination** (named peak, viewpoint, castle, hut, tarn, waterfall) and back. Usually
the same way back (`route: "tam-a-spat"`); a loop (`"okruh"`) when a path is one-way,
like the gorges in Slovenský raj.

Key fields of `TripSummary` (see `lib/tripSchema.ts` for all):

- `slug`: one per destination and stable across runs, even when a better start is found (`pipeline/slugs.json`); safe for URLs, saved trips and share links.
- `name`, `description`: generated in Slovak; curated trips and `pipeline/overrides.yaml` can override.
  `name` is unique among main trips and says what the place is (pipeline/names.py): "Hrad Likava", "Vyhliadka na Choč"; when several places share a name, the best known keeps it and the others get the nearest village, "Kriváň (Ludrová)". `destination.name` stays the plain OpenStreetMap name.
- `region` (one of the regions in `pipeline/config.yaml`: the national parks first, then the rest of Slovakia), `region_name`, `protected_area`.
- `destination` (`kind`, `ele_m`, `location`), `start`, `parking` (drive destination, `fee`), `transit` (nearest stop).
- `distance_m`, `ascent_m`, `duration_min` are for the **whole walk**. Time is DIN 33466 without breaks, rounded up to 15 min.
- `difficulty`: `lahka` ≤ 3 h and ≤ 400 m up and nothing harder than T2; `tazka` ≥ 6 h or ≥ 1,000 m up or any T4+; else `stredna`.
- `family_friendly`: `lahka`, ≤ 2.5 h, nothing harder than T2.
- `marking`: KST colours walked (`red`, `blue`, `green`, `yellow`, `black`), most-used first; `marked_share` 0..1.
- `fees`: entry fees from OSM tags or `fee-rules.json`. Empty means "none known", not "free".
- `closure_rule_ids`: rules from `closure-rules.json` that cover this trip. **Empty means "Stav chodníka neoverený", never "otvorené".** Use `isClosureActive()` in `lib/closures.ts` with the trip date to decide whether a rule is in force.
- `rank` 0..100 (how well known the destination is), `curated` (one of the 10 hand-picked trips), `gpx_url`, `bbox`.
- No city sights or city walks (since 2026-10-13): goals within 2.5 km of the centre of a 200k+ city (Bratislava, Košice) are left out (UFO, Bratislavský hrad, Slavín); towers and viewpoints in a built-up area too (castles, peaks, caves and waterfalls stay). A route that walks more than 1.5 km through built-up areas, or more than half of a short walk, is left out. For a goal in nature, a route with more than 1 km and over a third of the way on village or town streets (residential, living street, pedestrian, or any way in a built-up square) is used only when no start out of town is about as quick (within an hour, or half the time, more). Built-up = 250 m squares with at least 700 m of residential streets. `data/pipeline-report.md` lists what was dropped.
- Several routes per place (since 2026-10-13): `variant_of` is the main trip's slug on the other routes (absent on main routes); `route_label` (absent when a place has one route) says why to pick a route ("Hlavná cesta", "Cez <miesto>", "Autobusom", "Kratšia", "Na celý deň", "Dlhšia", "Menej do kopca", "Iným chodníkom" and "Okľukou" for another way from a start the place already has, "Zo severu" and the other sides, "Iná cesta"), each word once per place (`assign_labels`); main trips carry `route_count`. Up to 3 starts per place, and from each start one other way up when there is one (since 2026-10-15: over the top instead of round the hill; found by making the ways already found 4x dearer and routing again; at least 1 km and 35% of it new and mostly marked, not much longer), 5 routes per place at most. Its slug ends in `-ina-cesta`. A castle, cave, waterfall, viewpoint or tarn with a car park within 800 m of it also gets "Krátko od auta" (slug `<main>-od-auta`, at most 45 min), when the main route takes an hour or more and no route is short; never the main route, except for a castle or show cave (since 2026-11-07), where that visit is the main route and the hike another route. The main route is the best-known start (big car park, stop, food, several trails meeting, a village; see `known_score` in pipeline/trips.py), unless it is much longer. Other routes are full trips with their own file and a track in the place's GPX (no drive-table column: the trip page asks the router), but they are left out of `index.json`, `list.json` and the map lines. Each trip of such a place carries `routes` in its file: every route, main first, with its label, start, times and the way up (`up`, [lon, lat]), so the trip page reads only its own file.

`TripDetail` adds `path` (`[lon, lat, ele]`, ~10 m), `turnaround_index`, `marking_runs`
(index ranges of `path` with a KST colour, for drawing the route in trail colours),
`parking_alternatives`, `transit_alternatives`, `pois`.
`pois` lists huts, springs, viewpoints, castles, food and playgrounds within 150 m of the walk, then
up to 6 side trips (since 2026-10-23): a viewpoint, castle, hut or food off the walk that is at most
`detour_max_min` (30; viewpoints and castles `detour_view_max_min`, 40) minutes there and back,
by path or, within 300 m of the walk, cross-country, with `detour_min` (rounded to 5).
Food places carry `food` (since 2026-10-24): `restauracia`, `kaviaren` (café, pub, bar) or `bufet`
(fast food, or "bufet" in the name), which picks their pictogram (lib/food.ts).
In the trip's own file (not in `index.json`), each parking and stop may carry `walk`:
`{line: [[lon, lat], ...], m, min}`, the walk on paths to where the site joins the trail
(lib/trailJoin.ts), worked out weekly by pipeline/walks.py on a local OSRM (foot profile). The
trip page draws it instead of asking OpenRouteService (40 routes a minute on the free key).

## Drive times

`public/data/drive/<town>.json` holds car minutes (and km) by trip slug from one town
centre to each trip's parking, by OSRM on the same OSM data. The home page picks the
nearest town (`nearestTown()`) and fetches that town's file directly (no database
reads); the home list adds the way from the user's start to that town.

## Database and API

After each weekly build, `.github/workflows/db.yml` loads the same data into the
site's free Cloudflare D1 database (`python -m pipeline.db` writes the SQL; the visit
counter's tables are untouched). Tables: `region`, `protected_area`, `place` (goals and
starts), `trip` (with its walk as JSON), `parking`, `transit_stop` + `trip_transit_stop`,
`poi`, `closure_rule` + `trip_closure`, `fee` + `trip_fee`, `town`, `town_drive` (one row
per town, minutes and km as JSON arrays in trip id order), and
`data_version` (written last, so a half-finished load is never used).

- `GET /api/vylety?z=<town>&den=YYYY-MM-DD&limit=N`: trips nearest first from a town
  (an id from `data/towns.json`), drive there and back plus the walk, with
  `closed` for that day.
- `GET /api/vylety/<slug>`: one trip in the `TripDetail` shape.
- Trip pages read the database too.

Every read falls back to the files in `public/data` when the database is missing or not
loaded (local dev, Vercel, before the first load); the `zdroj` field and `X-Zdroj`
header say which one answered (`databaza` or `subory`). The loader needs the GitHub
secrets `CLOUDFLARE_API_TOKEN` (D1 Edit) and `CLOUDFLARE_ACCOUNT_ID`; without them it
only checks the SQL. It skips a load the database already holds (fingerprint in
`data_version`), since D1's free plan writes 100k rows a day. Otherwise it reads which trips the
database holds (each trip row carries a `content_hash` of itself and its parking, stops and POIs; ids
are hashes of the slug, so they stay the same week to week) and writes only the trips and shared rows
that changed. A full load (the first one, or after a schema change) writes about 65k rows
(2026-10-16), so at most one full load fits in a day.

## Licences and credit

- OpenStreetMap data, © OpenStreetMap contributors, ODbL 1.0. Commercial use allowed;
  every page showing trip data must credit "© OpenStreetMap contributors" with a link
  to https://www.openstreetmap.org/copyright.
- Elevation: Copernicus DEM GLO-30, © DLR e.V. 2010-2014 and © Airbus Defence and Space
  GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA. Free, commercial use allowed.
- Drive times: OSRM (BSD-2) on OSM data.
- Wikidata (ranking only): CC0.

## Changing things

- Regions, limits, hand-picked trips: `pipeline/config.yaml`.
  Hand-picked trips are routed like all others, preferring marked trails, so their
  `expect` values in the report can drift from the 2026-10-07 build.
- Search: `public/data/search.json` (`pipeline/search.py`, rebuilt with the trips) lists every named start, car park, stop, hut and sight by a trip with the trips that touch it. The home search matches it, so "Železná studnička" also finds Červený most next door and its trips.
- Rename a trip, rewrite its description or drop it: `pipeline/overrides.yaml`. A new name also goes to the other routes to that place.
- A well-known place is missing: add it to `watch` in `pipeline/config.yaml`; the next report says what became of it (no marked trail near it, too long, merged into a nearby goal, ...).
- Gorges (`roklina`): OSM valleys with a Wikipedia article up to 4.5 km long, or any valley or attraction named roklina / tiesňava / diery / prielom (`pipeline/osm.py`). A gorge is a line, so the trip goes to its upper end. Tatra "dolina" valleys stay out (long glacial valleys). Other sights with an article (Kláštorisko, a rock town) come in as `ine`.
- The database load runs in parts of at most 2 MB / 20 statements (`pipeline.db --parts`): one big file ran out of D1's CPU time. The version row goes last, so the site reads the static files until every part is in.
- Closure or fee: edit the JSON rule files (needs a source URL and a check date). Dates
  and texts apply at the next site build; a new rule area needs the next pipeline run
  (Actions → "Weekly trip data" → Run workflow).
- TANAP closures follow the official list of closed stretches (príloha č. 3 of the visitor
  rules): each `sections` entry is a marked route number with the named places it runs between,
  found on the OSM route relation (`pipeline/rules.py`). A trip is closed when it walks 400 m of a
  stretch or its goal lies on one. The weekly run (`--strict-rules`) keeps last week's trips when
  a stretch or place isn't found on the map or a rule covers no trip; a pull request that changes
  the rules runs `python -m pipeline.run --pbf <extract> --rules-only` to show each stretch and
  its length. The report's "Closure rules" section lists each rule's trips, lowest first.
