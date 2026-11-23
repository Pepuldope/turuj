// Lists every route whose walk, as the trip page shows it (lib/walkFacts.ts: trail plus the walk from the
// default parking or stop and back), is over the 9-hour day-trip cap (C106). Run: npx vite-node --config vitest.config.ts scripts/long-walks.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { routeWalk, trailDetailFrom } from "@/lib/data";
import type { TripDetail } from "@/lib/tripSchema";

const CAP = 540;
// Per-place caps from pipeline/config.yaml `place_limits:` (lines like `node/123: {max_duration_min: 555}`).
const LIMITS = new Map<string, number>();
for (const m of readFileSync(join(process.cwd(), "pipeline", "config.yaml"), "utf8").matchAll(/^\s+((?:node|way|relation)\/\d+):\s*\{max_duration_min:\s*(\d+)\}/gm)) LIMITS.set(m[1], Number(m[2]));
const DIR = join(process.cwd(), "public", "data", "trips");
const rows: string[] = [];
let n = 0;
for (const f of readdirSync(DIR)) {
  if (!f.endsWith(".json") || f === "index.json" || f === "list.json") continue;
  const t = JSON.parse(readFileSync(join(DIR, f), "utf8")) as TripDetail;
  n++;
  const w = routeWalk(trailDetailFrom(t));
  const car = w.car?.min ?? 0;
  const bus = w.bus?.min ?? 0;
  const cap = LIMITS.get(t.destination.osm ?? "") ?? CAP;
  if (car > cap || bus > cap)
    rows.push([t.slug, t.variant_of ? "variant" : "main", t.duration_min, car, bus, w.car?.approachMin ?? "", w.bus?.approachMin ?? ""].join("\t"));
}
console.log(`routes ${n}, over ${CAP} min: ${rows.length}`);
console.log("slug\tkind\ttrail\tcar\tbus\tcarApproach\tbusApproach");
for (const r of rows.sort()) console.log(r);
