// Guard against error 1102 ("Worker exceeded resource limits") coming back. On
// 2026-10-13 every trip page parsed the 5.7 MB trip index, which ran a free
// Worker out of CPU. The server reads these files on requests (lib/tripFiles.ts);
// each must stay small enough to parse well inside the limit, and the trip page
// must read only its own file. Drawing the pages themselves is guarded by
// scripts/check-page-cache.mjs (CI, after the build): that is what caused 1102
// again on 2026-10-14.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const MB = 1024 * 1024;
const DATA = join(process.cwd(), "public", "data");

/** Read once per server instance by the home page and the sitemap: was 1.6 MB fine, 5.7 MB not. */
const INDEX_MAX = 2.5 * MB;
/** Read on every trip page request (and drive tables by /api/vylety). */
const PER_REQUEST_MAX = 200 * 1024;

const largest = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "list.json")
    .map((f) => ({ f, size: statSync(join(dir, f)).size }))
    .sort((a, b) => b.size - a.size)[0];

describe("files the Worker reads stay small enough for its CPU limit", () => {
  it("trip index", () => {
    expect(statSync(join(DATA, "trips", "index.json")).size).toBeLessThan(INDEX_MAX);
  });

  it("each trip file and each town's drive file", () => {
    expect(largest(join(DATA, "trips")).size).toBeLessThan(PER_REQUEST_MAX);
    expect(largest(join(DATA, "drive")).size).toBeLessThan(PER_REQUEST_MAX);
  });

  it("place photos: small, and every host allowed by the page's img-src", () => {
    const file = join(DATA, "photos.json");
    expect(statSync(file).size).toBeLessThan(600 * 1024);
    const { photos } = JSON.parse(readFileSync(file, "utf8")) as { photos: Record<string, { url: string }> };
    const imgSrc = /"img-src ([^"]+)"/.exec(readFileSync(join(process.cwd(), "next.config.ts"), "utf8"))![1];
    // Mapillary photos are our own files ("/photos/m/…"), covered by 'self'.
    const hosts = new Set(Object.values(photos).filter((p) => !p.url.startsWith("/")).map((p) => new URL(p.url).origin));
    for (const host of hosts) expect(imgSrc.split(" ")).toContain(host);
  });

  // Every card on the home list loads this (C201, pipeline/terrain.py): the only static file the terrain pictures add
  // (the deploy is near Cloudflare's 20,000-file limit). Not there before the first run of the terrain workflow.
  it.skipIf(!existsSync(join(DATA, "terrain-cards.json")))("terrain pictures for the cards: small, one entry per place, every trip maps to one", () => {
    const raw = readFileSync(join(DATA, "terrain-cards.json"));
    expect(gzipSync(raw).length).toBeLessThan(150 * 1024);
    const f = JSON.parse(raw.toString("utf8")) as { v: number; places: Record<string, number[][]>; trips: Record<string, string> };
    expect(f.v).toBe(1);
    for (const id of new Set(Object.values(f.trips))) expect(f.places[id], id).toBeDefined();
  });

  it("the trip page never loads the whole index", () => {
    const page = readFileSync(join(process.cwd(), "app", "trasa", "[slug]", "page.tsx"), "utf8");
    expect(page).not.toMatch(/getTripIndex|getAllTrips|getAllTrails/);
  });
});
