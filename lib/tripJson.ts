// A trip's own file, /data/trips/<slug>.json, answered from the trip_json table in D1 (loaded by
// pipeline/db.py) instead of a static asset: Cloudflare's free plan allows 20,000 static files per
// deploy and these were 6,500 of them (C198). scripts/prune-trip-assets.mjs drops the files from the
// deploy once the table is loaded. The same address and the same bytes, so the pages, the offline
// saved-trip cache and everything else read it as before.
//
// Runs in worker.ts before Next.js (starting it costs ~580 ms of the free plan's 10 ms CPU). One
// request reads one row by primary key; a kept copy in the edge cache serves repeats with no row read.
import type { D1Like } from "@/lib/d1";
import { edgeHit, edgeKey, edgePut } from "@/lib/edgeCache";

/** Only these answers are made here: a trip's file. index.json and list.json stay static files. */
const SLUG = /^\/data\/trips\/([a-z0-9-]+)\.json$/;
const NOT_TRIPS = new Set(["index", "list"]);
const KEEP_S = 3600; // the data changes weekly
// What the static file got from Cloudflare's assets: re-checked on every visit (public/_headers).
const CLIENT_CACHE = "public, max-age=0, must-revalidate";
const TYPE = "application/json; charset=utf-8";

/** The slug of a trip's file address ("/data/trips/<slug>.json"), else null. */
export function slugOfPath(pathname: string): string | null {
  const slug = SLUG.exec(pathname)?.[1];
  return slug && !NOT_TRIPS.has(slug) ? slug : null;
}

/** The slug when this is a request for a trip's file the table can answer, else null. */
export function tripSlug(req: Request, pathname: string): string | null {
  return req.method === "GET" || req.method === "HEAD" ? slugOfPath(pathname) : null;
}

/** The file's text from the table, or null when the row is missing, still being written, or the database fails. */
export async function tripBody(db: D1Like | null | undefined, slug: string): Promise<string | null> {
  if (!db) return null;
  try {
    // hash '' marks a body the loader is still writing in pieces: not served.
    const row = await db.prepare("SELECT body FROM trip_json WHERE slug = ?1 AND hash <> ''").bind(slug).first<{ body: string }>();
    return row?.body ?? null;
  } catch {
    return null;
  }
}

function answer(req: Request, body: string): Response {
  return new Response(req.method === "HEAD" ? null : body, { headers: { "Content-Type": TYPE, "Cache-Control": CLIENT_CACHE } });
}

/** The answer for a trip's file, or null to let the static assets answer (no database, no row, not a trip file). */
export async function tripJson(
  req: Request,
  db: D1Like | null | undefined,
  ctx: { waitUntil(p: Promise<unknown>): void }
): Promise<Response | null> {
  const slug = tripSlug(req, new URL(req.url).pathname);
  if (!slug) return null;
  const key = edgeKey(req, {});
  const hit = await edgeHit(key);
  if (hit) return answer(req, await hit.text());
  const body = await tripBody(db, slug);
  if (body === null) return null;
  ctx.waitUntil(edgePut(key, new Response(body, { headers: { "Content-Type": TYPE, "Cache-Control": `public, max-age=${KEEP_S}` } })));
  return answer(req, body);
}
