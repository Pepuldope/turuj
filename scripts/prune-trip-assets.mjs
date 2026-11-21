// Drops the per-trip files from the built assets, after the OpenNext build and before the deploy (C198).
// Cloudflare's free plan allows 20,000 static files per deploy and public/data/trips/<slug>.json were
// 6,500 of them. worker.ts answers those addresses from the trip_json table in D1 instead
// (lib/tripJson.ts, loaded by pipeline/db.py). index.json and list.json stay static files.
//
// Safe by construction: it deletes nothing unless the database says it holds the trips. It asks D1
// (wrangler, with the Trip database workflow's D1 token) how many rows trip_json has and refuses, exit 1, when that
// is fewer than the files to drop (less a small tolerance) or can't be read. Then the deploy keeps
// the files; the workflow warns and goes on. To undo this whole thing: skip this step.
//
//   node scripts/prune-trip-assets.mjs                # asks D1
//   node scripts/prune-trip-assets.mjs --db-count N   # N rows known (tests, by hand)
//   node scripts/prune-trip-assets.mjs --dir <path>   # other assets folder

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Files in the folder that stay static: not a trip's own file. */
export const KEEP = new Set(["index.json", "list.json"]);
/** How many trips the table may lack before pruning is refused (a trip added since the last load). */
export const TOLERANCE = 25;
export const DATABASE = "mountour-visits";

/** True for a per-trip file name ("<slug>.json" other than index.json / list.json). */
export function isTripFile(name) {
  return name.endsWith(".json") && !KEEP.has(name);
}

/** Whether `rows` in trip_json cover the `files` about to be dropped. */
export function loadedEnough(rows, files) {
  return Number.isInteger(rows) && rows >= files - TOLERANCE;
}

function rowsInDatabase() {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DATABASE, "--remote", "--json", "--command", "SELECT COUNT(*) AS n FROM trip_json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return Number(JSON.parse(out)[0].results[0].n);
}

function main(argv) {
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const dir = join(arg("--dir") ?? ".open-next/assets", "data", "trips");
  if (!existsSync(dir)) {
    console.error(`No ${dir}: nothing to prune.`);
    return 0;
  }
  const files = readdirSync(dir).filter(isTripFile);
  let rows;
  try {
    rows = arg("--db-count") !== undefined ? Number(arg("--db-count")) : rowsInDatabase();
  } catch (err) {
    console.error(`Not pruning: could not count trip_json rows in D1 (${String(err.message ?? err).split("\n")[0]}).`);
    return 1;
  }
  if (!loadedEnough(rows, files.length)) {
    console.error(`Not pruning: D1's trip_json has ${rows} rows, ${files.length} trip files would go (run the Trip database workflow first).`);
    return 1;
  }
  for (const f of files) rmSync(join(dir, f));
  console.log(`Pruned ${files.length} trip files from ${dir}; D1 holds ${rows} (they are served by the Worker).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
