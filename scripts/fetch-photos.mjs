// Self-hosts the place photos (CI deploy only, before the build): downloads the 250/500/1280 px Commons
// thumbnails of every photo in public/data/photos.json into public/photos/c/ and points `url` at the
// 500 px copy (`src` keeps the Commons URL), so image search credits turuj.sk, not Wikimedia. An entry
// switches only when all three files exist; otherwise it keeps its Commons URL. Never fails a deploy.
// Usage: node scripts/fetch-photos.mjs [--file public/data/photos.json] [--dir public/photos/c]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const COMMONS_THUMB = /^(https:\/\/(?:thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/)\d+px-([^/]+)$/;
const STEPS = [250, 500, 1280];
const UA = "TurujPhotoFetch/1.0 (https://turuj.sk; info@turuj.sk)";
const CONCURRENCY = 4;
const RETRIES = 4;
const TIME_CAP_MS = 15 * 60 * 1000;

// Same as lib/photoName.ts (lib/photoName.test.ts keeps them equal); plain Node can't import the TS.
export const safeName = (f) => f.replace(/[^A-Za-z0-9._-]/g, "_");

/** The local file name (no directory) of one size of a Commons thumbnail URL, or null for other URLs. */
export function localName(url, w) {
  const m = COMMONS_THUMB.exec(url);
  if (!m) return null;
  const key = m[1].slice(m[1].indexOf("/commons/thumb/") + "/commons/thumb/".length).replace(/\/$/, "");
  const ext = /\.([A-Za-z0-9]+)$/.exec(m[2])?.[1].toLowerCase() ?? "jpg";
  return `${createHash("sha1").update(key).digest("hex").slice(0, 10)}-${safeName(m[2])}-${w}px.${ext}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (f) => existsSync(f) && statSync(f).size > 0;

async function download(url, file, fetchImpl, now, deadline, sleepImpl) {
  for (let i = 0; i <= RETRIES; i++) {
    if (now() > deadline) return false;
    let wait = Math.min(2 ** i * 2000, 60000);
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": UA } });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) return false;
        const tmp = `${file}.part`;
        writeFileSync(tmp, buf);
        renameSync(tmp, file);
        return true;
      }
      if (res.status !== 429 && res.status < 500) return false;
      const ra = Number(res.headers?.get?.("retry-after"));
      if (ra > 0) wait = Math.min(ra * 1000, 60000);
    } catch {
      // network error: retry
    }
    if (i < RETRIES) await sleepImpl(wait);
  }
  return false;
}

/**
 * Downloads what is missing and rewrites the entries in `photos` (mutated, also returned).
 * fetchImpl/now/sleepImpl are injectable for tests.
 */
export async function localise({ photos, dir, fetchImpl = fetch, now = Date.now, sleepImpl = sleep }) {
  mkdirSync(dir, { recursive: true });
  const deadline = now() + TIME_CAP_MS;
  const entries = Object.entries(photos).filter(([, p]) => p && typeof p.url === "string" && COMMONS_THUMB.test(p.url));
  let downloaded = 0;
  let local = 0;
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const [, p] = entries[next++];
      const m = COMMONS_THUMB.exec(p.url);
      let all = true;
      for (const w of STEPS) {
        const file = join(dir, localName(p.url, w));
        if (has(file)) continue;
        if (await download(`${m[1]}${w}px-${m[2]}`, file, fetchImpl, now, deadline, sleepImpl)) downloaded++;
        else all = false;
      }
      if (all) {
        p.src = p.url;
        p.url = `/photos/c/${localName(p.src, 500)}`;
        local++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const kept = entries.length - local;
  console.log(`photos: ${local} local, ${kept} kept on Commons, ${downloaded} downloaded now`);
  return { photos, local, kept, downloaded };
}

async function main() {
  const arg = (n, d) => process.argv[process.argv.indexOf(n) + 1] ?? d;
  const file = process.argv.includes("--file") ? arg("--file") : "public/data/photos.json";
  const dir = process.argv.includes("--dir") ? arg("--dir") : "public/photos/c";
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`fetch-photos: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  try {
    await localise({ photos: json.photos ?? {}, dir });
    writeFileSync(file, `${JSON.stringify(json)}\n`);
  } catch (e) {
    // A Commons outage must not block a deploy: leave photos.json as it was.
    console.error(`fetch-photos: skipped (${e.message})`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
