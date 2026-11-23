// C109: compares each route's track in its GPX file (public/gpx/<main slug>.gpx, one <trk> per route, slug in <desc>)
// with the km the trip page shows (lib/walkFacts.ts, by car) and with the trail's own distance_m.
// Run: npx vite-node --config vitest.config.ts scripts/gpx-check.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { routeWalk, trailDetailFrom } from "@/lib/data";
import { haversineM } from "@/lib/geo";
import type { TripDetail } from "@/lib/tripSchema";

const DIR = join(process.cwd(), "public", "data", "trips");
const GPX = join(process.cwd(), "public", "gpx");
const tracks = new Map<string, number>();
for (const f of readdirSync(GPX)) {
  const xml = readFileSync(join(GPX, f), "utf8");
  for (const trk of xml.split("<trk>").slice(1)) {
    const slug = /<desc>([^<]+)<\/desc>/.exec(trk)?.[1];
    if (!slug) continue;
    const pts = [...trk.matchAll(/<trkpt lat="([\d.-]+)" lon="([\d.-]+)"/g)].map((m) => ({ lat: +m[1], lon: +m[2] }));
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += haversineM(pts[i - 1], pts[i]);
    tracks.set(slug, m);
  }
}
const rows: [string, number, number, number, number][] = [];
let missing = 0;
for (const f of readdirSync(DIR)) {
  if (!f.endsWith(".json") || f === "index.json" || f === "list.json") continue;
  const t = JSON.parse(readFileSync(join(DIR, f), "utf8")) as TripDetail;
  const gpx = tracks.get(t.slug);
  if (gpx === undefined) {
    missing++;
    continue;
  }
  const page = routeWalk(trailDetailFrom(t)).car?.m ?? t.distance_m;
  rows.push([t.slug, gpx, t.distance_m, page, gpx / page]);
}
const off = (r: number) => Math.abs(r - 1) > 0.25;
const vsTrail = rows.filter((r) => Math.abs(r[1] / r[2] - 1) > 0.25).length;
console.log(`routes ${rows.length}, no GPX track ${missing}; GPX vs page km off by > 25 %: ${rows.filter((r) => off(r[4])).length}; GPX vs trail distance_m off by > 25 %: ${vsTrail}`);
const buckets = [0.5, 0.75, 0.9, 1.1, 1.25, 1.5, 2.5, Infinity];
const hist = buckets.map((b, i) => rows.filter((r) => r[4] < b && r[4] >= (buckets[i - 1] ?? 0)).length);
console.log("ratio GPX/page: " + buckets.map((b, i) => `<${b}: ${hist[i]}`).join(", "));
console.log("slug\tgpx_km\ttrail_km\tpage_km\tratio");
for (const r of rows.filter((x) => off(x[4])).sort((a, b) => b[4] - a[4]).slice(0, 40))
  console.log([r[0], (r[1] / 1000).toFixed(2), (r[2] / 1000).toFixed(2), (r[3] / 1000).toFixed(2), r[4].toFixed(2)].join("\t"));
