// Link-preview pictures for the trip pages (C207): for every place with a photo, a 1200x630 JPEG with the
// photo full-bleed, the Túruj logo top-left and the place's kind icon and name at the bottom (mockup
// "B, napis na fotke"). CI only, in the deploy and preview workflows after fetch-photos: the files go to
// public/og/p/<hash>.jpg (not in git, cached between runs) and `share` is set on the photos.json entry,
// which lib/tripFiles.ts shareImage() prefers. The hash covers the template and everything drawn, so a
// cached file is reused only when nothing about it changed. Never fails a deploy: a problem prints a
// ::warning:: and the page keeps the raw photo as its og:image.
// Places without a photo get the same card with their drawn terrain picture instead of the photo (lib/terrainScene.ts,
// data/terrain.json): files in the same folder, recorded in data/share-terrain.json, read by getTerrainShare().
// Usage: npx vite-node scripts/share-pics.ts [--plan] [--limit N] [--keys k1,k2] [--out DIR] [--photos FILE] [--no-write]
// Local runs without playwright installed here: PLAYWRIGHT_PATH=<dir holding node_modules/playwright-core>.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { kindSvg } from "../lib/kindIcons";
import { formatDurationShort } from "../lib/format";
import { formatKm } from "../lib/walkFacts";
import { GOAL_COLOUR, POI_COLOUR } from "../lib/palette";
import { bannerScene, terrainKeyOf, type PackedLayers } from "../lib/terrainScene";
import type { DestinationKind } from "../lib/tripSchema";
import type { PlacePhoto } from "../lib/tripFiles";

/** Bump when the picture's look changes: every cached file is then made again. */
export const TEMPLATE_VERSION = 3;

const W = 1200;
const H = 630;
const SHARE_W = 1280;
const UA = "TurujShareImages/1.0 (https://turuj.sk; info@turuj.sk)";
const CONCURRENCY = 4;
const RETRIES = 4;
const TIME_CAP_MS = 15 * 60 * 1000;
const COMMONS_THUMB = /^(https:\/\/(?:thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/)\d+px-([^/]+)$/;
const ROOT = process.cwd();

interface Place {
  key: string;
  name: string;
  kind: string;
  /** The main trip's walk, climb, time and region: "Hlavná trasa: 11,2 km · ↑ 124 m · 3 h 15 · Slovenský raj" (C52). */
  facts?: string;
}

/** The facts line under the name (C52): length, climb, walking time, region; parts that are missing are left out. */
export function factsLine(t: { distance_m?: number | null; ascent_m?: number | null; duration_min?: number | null; region_name?: string | null }): string {
  const parts: string[] = [];
  if (t.distance_m) parts.push(formatKm(t.distance_m));
  if (t.ascent_m && t.ascent_m >= 10) parts.push(`↑\u00a0${Math.round(t.ascent_m)}\u00a0m`);
  if (t.duration_min) parts.push(formatDurationShort(Math.round(t.duration_min)));
  if (t.region_name) parts.push(t.region_name);
  // The card is the place's, also on its side routes' pages: say whose numbers these are (Peter, 28 Nov).
  return parts.length ? `Hlavná trasa: ${parts.join(" · ")}` : "";
}

const warn = (m: string) => console.log(`::warning::share pictures: ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const has = (f: string) => existsSync(f) && statSync(f).size > 0;

/** Where to read the 1280 px photo from: a Commons URL, or a file under public/ (Mapillary). Null when unusable. */
export function sourceOf(p: PlacePhoto): { url?: string; file?: string } | null {
  let url = p.url;
  if (p.src && url.startsWith("/photos/c/")) url = p.src;
  if (url.startsWith("/photos/")) return { file: join(ROOT, "public", url) };
  if (!/^https:\/\//.test(url)) return null;
  const m = COMMONS_THUMB.exec(url);
  if (m && p.via !== "mapillary" && p.w > 0 && p.w < SHARE_W) url = `${m[1]}${SHARE_W}px-${m[2]}`;
  return { url };
}

export function hashOf(key: string, source: string, name: string, kind: string, p: PlacePhoto, facts = ""): string {
  return createHash("sha1").update(TEMPLATE_VERSION + key + source + name + kind + p.author + p.license + facts).digest("hex").slice(0, 12);
}

/** Hash of a terrain card: the template, the place, and the picture drawn (its SVG covers the layers and the drawing code). */
export function terrainHashOf(key: string, name: string, kind: string, svg: string, facts = ""): string {
  const drawn = createHash("sha1").update(svg).digest("hex");
  return createHash("sha1").update(`${TEMPLATE_VERSION}${key}${name}${kind}terrain${drawn}${facts}`).digest("hex").slice(0, 12);
}

export interface TerrainPlace { k: DestinationKind; banner: PackedLayers }

/** The scene of a place as the trip page draws it (components/TripSheet.tsx): SVG markup. */
export function terrainSvgOf(key: string, t: TerrainPlace): string {
  return bannerScene(key, t.k, t.banner).svg;
}

/** Keys that get a terrain card: in terrain.json, no photo, and a known place. */
export function terrainKeys(terrain: Record<string, TerrainPlace>, photos: Record<string, unknown>, places: Map<string, Place>): string[] {
  return Object.keys(terrain).filter((k) => !photos[k] && places.has(k));
}

/** Each place's name, kind and facts, by photo key as lib/tripFiles.ts getTripPhoto() finds it; its main trip wins over variants. */
function placesFromTrips(): Map<string, Place> {
  return readTrips((t, d, keys) => d.osm ?? keys[t.slug] ?? `trip/${t.slug}`, true);
}

/** The same, by the key the trip page finds its terrain picture under (terrainKeyOf); a place's main trip wins over its variants. */
function terrainPlacesFromTrips(): Map<string, Place> {
  return readTrips((t, d) => terrainKeyOf({ destination: d, variant_of: t.variant_of, slug: t.slug }), true);
}

function readTrips(keyOf: (t: { slug: string; variant_of?: string | null }, d: { osm?: string | null }, keys: Record<string, string>) => string, mainFirst = false): Map<string, Place> {
  const dir = join(ROOT, "public", "data", "trips");
  let keys: Record<string, string> = {};
  try {
    keys = JSON.parse(readFileSync(join(ROOT, "public", "data", "photo-keys.json"), "utf8"));
  } catch {
    // absent: every trip uses its own key
  }
  const out = new Map<string, Place>();
  const fromVariant = new Set<string>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "index.json" && x !== "list.json").sort()) {
    try {
      const t = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const d = t?.destination;
      if (!t?.slug || !d?.name || !d?.kind) continue;
      const key = keyOf(t, d, keys);
      if (!out.has(key) || (mainFirst && fromVariant.has(key) && !t.variant_of)) {
        out.set(key, { key, name: String(d.name), kind: String(d.kind), facts: factsLine(t) || undefined });
        if (t.variant_of) fromVariant.add(key);
        else fromVariant.delete(key);
      }
    } catch {
      // unreadable trip file: skip it
    }
  }
  return out;
}

async function download(url: string, file: string, deadline: number): Promise<boolean> {
  for (let i = 0; i <= RETRIES; i++) {
    if (Date.now() > deadline) return false;
    let wait = Math.min(2 ** i * 2000, 60000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return false;
        writeFileSync(file, buf);
        return true;
      }
      if (res.status !== 429 && res.status < 500) return false;
      const ra = Number(res.headers.get("retry-after"));
      if (ra > 0) wait = Math.min(ra * 1000, 60000);
    } catch {
      // network error: retry
    }
    if (i < RETRIES) await sleep(wait);
  }
  return false;
}

// Playwright is loaded by name at run time (it may be missing), so there are no types to lean on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPlaywright(): Promise<any | null> {
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return await import(/* @vite-ignore */ name);
    } catch {
      // try the next one
    }
  }
  const extra = process.env.PLAYWRIGHT_PATH;
  if (extra) {
    for (const name of ["playwright", "playwright-core"]) {
      try {
        return createRequire(join(resolve(extra), "package.json"))(name);
      } catch {
        // try the next one
      }
    }
  }
  return null;
}

const fontFace = (family: string, weight: string, file: string, range = "") =>
  `@font-face{font-family:${family};font-weight:${weight};${range}src:url(file://${join(ROOT, "public", "fonts", file)})}`;

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2246 963" height="46" style="display:block;flex:none"><g transform="translate(26,759) scale(1,-1)"><path fill="#14233b" d="M177 0V660H339V0ZM14 522V660H502V522Z M698 -14Q612 -14 570.5 46.0Q529 106 529 230V528H691V232Q691 174 707.5 151.0Q724 128 755 128Q777 128 795.5 139.5Q814 151 828.0 174.5Q842 198 849.5 235.0Q857 272 857 324V528H1019V238V0H881V206H874Q868 129 847.0 80.5Q826 32 789.0 9.0Q752 -14 698 -14Z M1073 0V287V528H1213V318H1221Q1227 402 1244.5 450.5Q1262 499 1288.5 519.5Q1315 540 1348 540Q1366 540 1385.5 535.0Q1405 530 1424 519L1416 339Q1394 352 1373.0 358.5Q1352 365 1333 365Q1301 365 1279.0 347.0Q1257 329 1245.5 294.0Q1234 259 1234 209V0Z M1619 -14Q1533 -14 1491.5 46.0Q1450 106 1450 230V528H1612V232Q1612 174 1628.5 151.0Q1645 128 1676 128Q1698 128 1716.5 139.5Q1735 151 1749.0 174.5Q1763 198 1770.5 235.0Q1778 272 1778 324V528H1940V238V0H1802V206H1795Q1789 129 1768.0 80.5Q1747 32 1710.0 9.0Q1673 -14 1619 -14Z M2000 -164Q1987 -164 1973.5 -162.5Q1960 -161 1946 -159L1933 -22Q1972 -24 1988.0 -10.5Q2004 3 2004 42V528H2166V33Q2166 -21 2153.5 -58.5Q2141 -96 2118.0 -119.5Q2095 -143 2065.0 -153.5Q2035 -164 2000 -164Z M2084 566Q2038 566 2013.5 585.5Q1989 605 1989 642Q1989 680 2013.5 699.5Q2038 719 2084 719Q2131 719 2155.5 699.0Q2180 679 2180 642Q2180 606 2155.5 586.0Q2131 566 2084 566Z"/><path fill="#ffb81c" d="M837 572H693L753 698H933Z"/></g></svg>`;

const TILE = 64;
const GAP = 18;
const NAME_W = W - 2 * 44 - TILE - GAP;

function colourOf(kind: string): string {
  return (GOAL_COLOUR as Record<string, string>)[kind] ?? (POI_COLOUR as Record<string, string>)[kind] ?? "#5b6455";
}

/** The card around a background: dark gradient, logo pill, kind tile and name, credit line top-right. */
function shellHtml(place: Place, background: string, credit: string): string {
  const glyph = (kindSvg as (k: string, s: number) => string)(place.kind, Math.round(TILE * 0.62 * 100) / 100);
  return `<!DOCTYPE html><html lang="sk"><head><meta charset="utf-8"><style>${fontFace("Bric", "800", "bricolage-grotesque-latin-800.woff2")}
${fontFace("Bric", "800", "bricolage-grotesque-latin-ext-800.woff2", "unicode-range:U+0100-02BA;")}
${fontFace("Fig", "400 800", "figtree-latin.woff2")}
${fontFace("Fig", "400 800", "figtree-latin-ext.woff2", "unicode-range:U+0100-02BA;")}
*{box-sizing:border-box;margin:0;padding:0}body{width:${W}px;height:${H}px;overflow:hidden;position:relative;font-family:Fig,system-ui,sans-serif;color:#14233b;background:#f5f9fc}
.ph{position:absolute;object-fit:cover;display:block}.d{font-family:Bric,Fig,sans-serif;font-weight:800;letter-spacing:-.02em;line-height:1}
.cr{position:absolute;font-size:15px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7)}
#nm{width:${NAME_W}px;font-size:84px;white-space:nowrap;overflow:hidden}</style></head><body>${background}
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25) 0,transparent 35%,rgba(0,0,0,.72) 100%)"></div>
<div style="position:absolute;left:44px;top:40px;background:#fff;border-radius:999px;padding:14px 26px 12px">${LOGO}</div>
<div style="position:absolute;left:44px;right:44px;bottom:44px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.5);display:flex;align-items:center;gap:${GAP}px"><span style="display:grid;place-items:center;width:${TILE}px;height:${TILE}px;border-radius:19.2px;background:color-mix(in srgb,${colourOf(place.kind)} 88%,#000);flex:none;color:#fff">${glyph}</span><div style="min-width:0"><div class="d" id="nm">${esc(place.name)}</div>${place.facts ? `<div style="margin-top:10px;font-size:30px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:${NAME_W}px">${esc(place.facts)}</div>` : ""}</div></div>
<span class="cr" style="right:20px;top:20px">${esc(credit)}</span></body></html>`;
}

function pageHtml(place: Place, p: PlacePhoto, photoFile: string): string {
  const author = p.author.length > 40 ? `${p.author.slice(0, 39)}…` : p.author;
  const archive = p.via === "mapillary" ? "Mapillary" : "Wikimedia Commons";
  const bg = `<img class="ph" id="ph" src="file://${photoFile}" style="inset:0;width:${W}px;height:${H}px;object-position:50% 45%">`;
  return shellHtml(place, bg, `Foto: ${author}, ${p.license}, ${archive}`);
}

/** The terrain card: the drawn picture (cover, anchored at the bottom) on the kind's colour, as on the trip page. */
export function terrainPageHtml(place: Place, svg: string): string {
  const colour = (GOAL_COLOUR as Record<string, string>)[place.kind] ?? GOAL_COLOUR.ine;
  const bg = `<div style="position:absolute;inset:0;background:${colour}">${svg}</div>`;
  return shellHtml(place, bg, "Výškové dáta: AWS Terrain Tiles (Mapzen)");
}

/** Sizes the name in the page: one line from 84 px down to 64, else two lines from 72 down to 52, else 44 px clipped. */
const FIT = `(async () => {
  await document.fonts.ready;
  const img = document.getElementById("ph");
  if (img) await img.decode();
  const el = document.getElementById("nm");
  const oneLine = () => el.scrollWidth <= el.clientWidth + 0.5;
  const twoLines = (s) => el.scrollWidth <= el.clientWidth + 0.5 && el.getBoundingClientRect().height <= s * 1.05 * 2 + 1;
  for (let s = 84; s >= 64; s -= 4) { el.style.fontSize = s + "px"; if (oneLine()) return s; }
  el.style.whiteSpace = "normal"; el.style.lineHeight = "1.05";
  for (let s = 72; s >= 52; s -= 4) { el.style.fontSize = s + "px"; if (twoLines(s)) return s; }
  el.style.fontSize = "44px"; el.style.maxHeight = (44 * 1.05 * 2) + "px";
  return 44;
})()`;

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.includes(n);
  const val = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const outDir = resolve(val("--out") ?? join(ROOT, "public", "og", "p"));
  const photosFile = resolve(val("--photos") ?? join(ROOT, "public", "data", "photos.json"));
  const limit = val("--limit") ? Number(val("--limit")) : Infinity;
  const only = val("--keys") ? new Set(val("--keys")!.split(",")) : null;
  const publicPath = (hash: string) => `/og/p/${hash}.jpg`;

  const json = JSON.parse(readFileSync(photosFile, "utf8")) as { photos: Record<string, PlacePhoto & { share?: string }> };
  const places = placesFromTrips();
  const terrainFile = resolve(join(ROOT, "data", "share-terrain.json"));

  interface Job { place: Place; photo: PlacePhoto; src: { url?: string; file?: string }; hash: string; file: string }
  interface TJob { place: Place; svg: string; hash: string; file: string }
  const jobs: Job[] = [];
  for (const [key, photo] of Object.entries(json.photos)) {
    const place = places.get(key);
    if (!place || !photo) continue;
    const src = sourceOf(photo);
    if (!src) continue;
    const hash = hashOf(key, src.url ?? src.file!.slice(ROOT.length), place.name, place.kind, photo, place.facts);
    jobs.push({ place, photo, src, hash, file: join(outDir, `${hash}.jpg`) });
  }
  const scoped = jobs.filter((j) => !only || only.has(j.place.key)).slice(0, limit);
  const missing = scoped.filter((j) => !has(j.file));

  // Terrain cards: places in data/terrain.json with no photo.
  const tJobs: TJob[] = [];
  try {
    const terrain = (JSON.parse(readFileSync(join(ROOT, "data", "terrain.json"), "utf8")) as { places: Record<string, TerrainPlace> }).places;
    const tPlaces = terrainPlacesFromTrips();
    for (const key of terrainKeys(terrain, json.photos, tPlaces)) {
      const place = tPlaces.get(key)!;
      const svg = terrainSvgOf(key, terrain[key]);
      const hash = terrainHashOf(key, place.name, place.kind, svg, place.facts);
      tJobs.push({ place, svg, hash, file: join(outDir, `${hash}.jpg`) });
    }
  } catch (e) {
    warn(`no terrain cards (${(e as Error).message})`);
  }
  const tScoped = tJobs.filter((j) => !only || only.has(j.place.key)).slice(0, limit);
  const tMissing = tScoped.filter((j) => !has(j.file));
  const queue: (Job | TJob)[] = [...missing, ...tMissing];

  if (flag("--plan")) {
    console.log(`share pictures: ${queue.length} missing of ${scoped.length + tScoped.length} (photos ${missing.length} of ${scoped.length}, terrain ${tMissing.length} of ${tScoped.length})`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `missing=${queue.length}\n`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  let made = 0;
  let failed = 0;
  let tMade = 0;
  let tFailed = 0;
  if (queue.length) {
    const pw = await loadPlaywright();
    if (!pw) warn("playwright is not installed; nothing rendered");
    else {
      const tmp = mkdtempSync(join(tmpdir(), "share-pics-"));
      const deadline = Date.now() + TIME_CAP_MS;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let browser: any;
      try {
        browser = await (pw.chromium ?? pw.default?.chromium).launch();
        let next = 0;
        const worker = async (n: number) => {
          const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
          const page = await ctx.newPage();
          while (next < queue.length) {
            const j = queue[next++];
            const terrain = "svg" in j;
            if (Date.now() > deadline) { if (terrain) tFailed++; else failed++; continue; }
            try {
              const html = join(tmp, `${n}.html`);
              let photoFile: string | undefined;
              if (terrain) writeFileSync(html, terrainPageHtml(j.place, j.svg));
              else {
                photoFile = j.src.file;
                if (!photoFile) {
                  photoFile = join(tmp, `${j.hash}.src`);
                  if (!(await download(j.src.url!, photoFile, deadline))) throw new Error(`download failed: ${j.src.url}`);
                }
                if (!has(photoFile)) throw new Error(`photo file missing: ${photoFile}`);
                writeFileSync(html, pageHtml(j.place, j.photo, photoFile));
              }
              await page.goto(`file://${html}`, { waitUntil: "load" });
              await page.evaluate(FIT);
              const buf: Buffer = await page.screenshot({ type: "jpeg", quality: 72 });
              writeFileSync(`${j.file}.part`, buf);
              renameSync(`${j.file}.part`, j.file);
              if (terrain) tMade++;
              else {
                made++;
                if (j.src.url) rmSync(photoFile!, { force: true });
              }
            } catch (e) {
              if (terrain) tFailed++;
              else failed++;
              warn(`${j.place.key}: ${(e as Error).message}`);
            }
          }
          await ctx.close();
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, (_, n) => worker(n)));
      } catch (e) {
        warn(`rendering stopped: ${(e as Error).message}`);
        failed = missing.filter((j) => !has(j.file)).length;
        tFailed = tMissing.filter((j) => !has(j.file)).length;
      } finally {
        await browser?.close().catch(() => {});
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }

  // Write back: `share` for every entry whose file exists; drop files nothing references.
  const wanted = new Set<string>();
  if (!flag("--no-write")) {
    for (const j of jobs) {
      if (has(j.file)) {
        json.photos[j.place.key].share = publicPath(j.hash);
        wanted.add(`${j.hash}.jpg`);
      } else delete json.photos[j.place.key].share;
    }
    writeFileSync(photosFile, `${JSON.stringify(json)}\n`);
    const pictures: Record<string, string> = {};
    for (const j of tJobs) {
      if (has(j.file)) {
        pictures[j.place.key] = publicPath(j.hash);
        wanted.add(`${j.hash}.jpg`);
      }
    }
    writeFileSync(terrainFile, `${JSON.stringify({ version: 1, pictures })}\n`);
    for (const f of readdirSync(outDir)) if (!wanted.has(f)) rmSync(join(outDir, f), { force: true });
  }
  console.log(
    `share pictures: photos: ${scoped.length} total, ${scoped.length - missing.length} reused, ${made} made, ${failed} failed; ` +
      `terrain: ${tScoped.length} total, ${tScoped.length - tMissing.length} reused, ${tMade} made, ${tFailed} failed`,
  );
}

// Not under vitest, which imports the pure functions above.
if (!process.env.VITEST) {
  try {
    await main();
  } catch (e) {
    warn(`skipped (${(e as Error).message})`);
  }
  process.exit(0);
}
