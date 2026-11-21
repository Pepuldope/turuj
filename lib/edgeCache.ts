// Cloudflare's own cache in front of the routing APIs: the same parking and
// trail start give the same walk for everyone, so the router is asked once a
// day per pair, not on every visit. Free, no binding. Outside Cloudflare
// (local dev, Vercel) there is no `caches.default` and this just computes.

type EdgeCache = {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
};

function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}

/** An answer may ask to be kept for less time than usual (a route that is only partly right). */
export const KEEP_FOR = "X-Keep-For";

/** The cache key for this GET: its URL, with the query replaced by `params` when given. */
export function edgeKey(req: Request, params?: Record<string, string>): Request {
  const url = new URL(req.url);
  if (params) url.search = new URLSearchParams(params).toString();
  return new Request(url.toString(), { method: "GET" });
}

/** A kept answer for this key, or null (no edge cache here, a miss, or a hiccup). */
export async function edgeHit(key: Request): Promise<Response | null> {
  try {
    return (await edgeCache()?.match(key)) ?? null;
  } catch {
    return null;
  }
}

/**
 * A cached answer for this GET, else `compute()`; good answers are kept for `maxAgeS`
 * (or the shorter `X-Keep-For` seconds the answer names).
 * `params` (the parsed, rounded inputs) make the key, so extra or reordered query
 * parameters can't skip the cache; without them the URL is the key.
 */
export async function withEdgeCache(
  req: Request,
  maxAgeS: number,
  compute: () => Promise<Response>,
  params?: Record<string, string>
): Promise<Response> {
  const cache = edgeCache();
  const key = edgeKey(req, params);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return hit;
    } catch {
      // A cache hiccup must not cost the route.
    }
  }
  const res = await compute();
  const keepFor = Number(res.headers.get(KEEP_FOR));
  const ageS = keepFor > 0 ? Math.min(keepFor, maxAgeS) : maxAgeS;
  if (cache && res.ok) {
    try {
      const copy = new Response(res.clone().body, res);
      copy.headers.delete(KEEP_FOR);
      copy.headers.set("Cache-Control", `public, max-age=${ageS}`);
      await cache.put(key, copy);
    } catch {
      // Not cached this time; the answer still goes out.
    }
  }
  return res;
}

/**
 * A small JSON value kept in the edge cache under a made-up URL on this site (not a route anyone
 * calls), for answers shared between requests that aren't one URL's answer. Errors read as a miss.
 */
export function edgeJson<T>(origin: string, path: string, maxAgeS: number) {
  const req = (id: string) => new Request(`${origin}${path}?k=${encodeURIComponent(id)}`, { method: "GET" });
  return {
    async get(id: string): Promise<T | null> {
      const cache = edgeCache();
      if (!cache) return null;
      try {
        const hit = await cache.match(req(id));
        return hit ? ((await hit.json()) as T) : null;
      } catch {
        return null;
      }
    },
    async put(id: string, value: T): Promise<void> {
      const cache = edgeCache();
      if (!cache) return;
      try {
        await cache.put(req(id), Response.json(value, { headers: { "Cache-Control": `public, max-age=${maxAgeS}` } }));
      } catch {
        // Not kept this time.
      }
    },
  };
}

/** Keep `res` in the edge cache under `key` (it needs its own Cache-Control max-age). Errors are ignored. */
export async function edgePut(key: Request, res: Response): Promise<void> {
  try {
    await edgeCache()?.put(key, res);
  } catch {
    // Not kept this time.
  }
}
