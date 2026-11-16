// Guard against error 1102 ("Worker exceeded resource limits") coming back.
// The free Worker plan gives each request 10 ms of CPU, and drawing a page
// costs several times that, so a page may never be drawn on every visit: it
// must be built ahead (home, info and trip pages) or drawn once and kept (route
// comparisons, lib/pageCache.ts). Run after `npm run cf:build`; fails when a page
// would be drawn per visit or would ask to be redrawn on a timer, when trip pages
// aren't built ahead, or when the deploy would hold too many files.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Pages that may draw on every visit, and why (/statistiky is prebuilt since #121). */
const ALLOWED_PER_VISIT = {
  // #232: unknown addresses under /en only call notFound() so the 404 gets English metadata. It is drawn
  // per visit but only for wrong addresses, and a 404 is the answer there either way (15 Nov 2026).
  "/en/[...rest]": "English 404 for unknown /en addresses",
};

const routes = JSON.parse(readFileSync(".next/app-path-routes-manifest.json", "utf8"));
const prerender = JSON.parse(readFileSync(".next/prerender-manifest.json", "utf8"));
const config = readFileSync("open-next.config.ts", "utf8");

const problems = [];
const pages = Object.entries(routes)
  .filter(([file]) => file.endsWith("/page"))
  .map(([, path]) => path)
  .filter((path) => !path.startsWith("/_"));

for (const path of pages) {
  if (path in ALLOWED_PER_VISIT) continue;
  const built = prerender.routes[path];
  const onFirstVisit = prerender.dynamicRoutes[path];
  if (!built && !onFirstVisit) {
    problems.push(`${path} is drawn on every visit. Make it static, or give it generateStaticParams (see app/trasa/[slug]/page.tsx).`);
  }
  const seconds = built?.initialRevalidateSeconds ?? onFirstVisit?.fallbackRevalidate;
  if (typeof seconds === "number") {
    problems.push(`${path} uses revalidate (${seconds} s). The page cache is read-only between deploys: remove it.`);
  }
}
for (const path of Object.keys(prerender.routes)) {
  const seconds = prerender.routes[path].initialRevalidateSeconds;
  if (typeof seconds === "number" && !pages.includes(path)) {
    problems.push(`${path} uses revalidate (${seconds} s). The page cache is read-only between deploys: remove it.`);
  }
}
if (!/incrementalCache:\s*pageCache/.test(config) || !/enableCacheInterception:\s*true/.test(config)) {
  problems.push("open-next.config.ts must use lib/pageCache.ts with enableCacheInterception: true.");
}

// Trip pages are built ahead, so a trip's first visit after a deploy is quick (2026-10-15).
const tripFiles = readdirSync("public/data/trips").filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "list.json");
const builtTrips = Object.keys(prerender.routes).filter((path) => /^\/trasa\/[^/]+$/.test(path));
if (builtTrips.length < tripFiles.length) {
  problems.push(`Only ${builtTrips.length} of ${tripFiles.length} trip pages are built ahead; the rest are slow on their first visit.`);
}

// The free plan takes at most 20,000 files per deploy: the assets plus the built pages,
// which the deploy copies in next to them (static-assets cache).
const MAX_FILES = 20000;
const COPIED_CACHE = join(".open-next", "assets", "cdn-cgi", "_next_cache"); // after a preview: counted once below
const countFiles = (dir) =>
  dir === COPIED_CACHE
    ? 0
    : readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? countFiles(join(dir, e.name)) : 1), 0);
const deployFiles = countFiles(join(".open-next", "assets")) + countFiles(join(".open-next", "cache"));
const WARN_FILES = 19000;
if (deployFiles > MAX_FILES) {
  problems.push(`The deploy would hold ${deployFiles} files, over the free plan's ${MAX_FILES}. Build fewer trip pages ahead (docs/DEPLOY-CLOUDFLARE.md).`);
} else if (deployFiles > WARN_FILES) {
  // A GitHub Actions warning: shows on the run's summary page, doesn't fail it.
  console.log(`::warning::The deploy holds ${deployFiles} files, close to the free plan's ${MAX_FILES}.`);
}

if (problems.length) {
  console.error("Pages that would run the free Worker out of CPU (error 1102):\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`Page cache check: ${pages.length} pages, all built ahead or kept after the first visit; ${builtTrips.length} trip pages built ahead; ${deployFiles} files to deploy.`);
