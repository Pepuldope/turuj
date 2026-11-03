import staticAssetsCache, { NAME } from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";
import { computeCacheKey } from "@opennextjs/cloudflare/overrides/internal";
import type { CacheEntryType, CacheValue, IncrementalCache, WithLastModified } from "@opennextjs/aws/types/overrides";

// Where the Worker keeps finished pages, so it draws each page once per deploy
// instead of on every visit (error 1102, 2026-10-14: drawing a trip page costs
// several times the free plan's 10 ms of CPU per request).
//
// 1. Pages built ahead (home, sitemap, info pages, every trip page) ship with
//    the deploy as static files. Keeping the static-assets cache's name makes the
//    deploy copy them there (opennextjs-cloudflare populateCache).
// 2. Pages the build can't know (route comparisons, loops, a trip newer than the
//    build) are drawn on their first visit and kept in Cloudflare's edge cache
//    (the Workers Cache API, caches.default). Keys carry the build id, so a deploy
//    (also the weekly trip data) starts fresh; entries expire on their own.
//
// Until 3 Nov 2026 these went to the KV store PAGE_CACHE instead. KV allows only
// 1,000 writes a day on the free plan, and crawlers plus up to 5 deploys a day
// (each one starting the cache afresh) used them up by morning, every day (Cloudflare
// e-mails from 26 Oct). The edge cache has no daily limit and costs nothing; it is
// kept per data centre, so a page is drawn once in each place it is asked for.
// Only on turuj.sk: on *.workers.dev and in `next start` there is no edge cache and
// a page is simply drawn on each visit. Every cache error is swallowed here.

/** How long a drawn page stays: old builds' pages are unreachable after the next deploy anyway. */
const TTL_SECONDS = 3 * 24 * 3600;

function edge(): Cache | undefined {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  } catch {
    return undefined;
  }
}

/** The Cache API keys on URLs; this host is never fetched, it only names the entry. */
const edgeKey = (key: string) =>
  new Request(
    `https://page-cache.turuj.sk/${encodeURIComponent(computeCacheKey(key, { prefix: "pages", buildId: process.env.OPEN_NEXT_BUILD_ID, cacheType: "cache" }))}`
  );

const pageCache: IncrementalCache = {
  name: NAME,

  async get<T extends CacheEntryType = "cache">(key: string, cacheType?: T) {
    type Entry = WithLastModified<CacheValue<T>> | null;
    try {
      const built = await staticAssetsCache.get(key, cacheType);
      if (built) return built as Entry;
    } catch {
      // No static assets (local `next start`): try the edge cache.
    }
    // Only whole pages are kept; data fetches are not worth an entry each.
    if ((cacheType ?? "cache") !== "cache") return null;
    try {
      const hit = await edge()?.match(edgeKey(key));
      return hit ? ((await hit.json()) as Entry) : null;
    } catch {
      return null;
    }
  },

  async set(key, value, cacheType) {
    if ((cacheType ?? "cache") !== "cache") return;
    // A mistyped or probed address must not be kept.
    if (((value as { meta?: { status?: number } }).meta?.status ?? 200) >= 400) return;
    try {
      await edge()?.put(
        edgeKey(key),
        new Response(JSON.stringify({ value, lastModified: Date.now() }), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${TTL_SECONDS}` },
        })
      );
    } catch {
      // No edge cache here: the page still renders.
    }
  },

  async delete(key) {
    try {
      await edge()?.delete(edgeKey(key));
    } catch {
      // Nothing to do.
    }
  },
};

export default pageCache;
