import { roundCoord } from "@/lib/drive";
import { KEEP_FOR, edgeJson, withEdgeCache } from "@/lib/edgeCache";
import { OTHER_SITE, fromOtherSite, overRouteLimit } from "@/lib/routeGuard";
import { RateLimited, driveRoute, finishDrive, knownTail, lastStretch, simplifyLine } from "@/lib/routing";
import type { KnownTail, Pt, TailStore } from "@/lib/routing";

/**
 * GET /api/drive?from=lat,lon&to=lat,lon -> DriveRoute
 *
 * OpenRouteService when ORS_API_KEY is set (production; key stays server-side).
 * Without a key it falls back to the public OSRM demo server, which is fine for
 * local development but has no SLA. When the road route stops short of the
 * parking, the last stretch follows tracks and minor roads (lib/routing.ts).
 */

// Slovakia plus a generous margin (Vienna, Brno, Budapest, Kraków starts).
const AREA = { minLat: 45, maxLat: 52, minLon: 12, maxLon: 25 };
/** Simplify the drawn line to within this many metres of the road (small, so bends stay on the road when zoomed in). */
const SHAPE_TOL_M = 2;
const DAY_S = 86400;
/** A drive that stops short of the parking (the last stretch failed): ask again soon. */
const PARTIAL_S = 600;
/** The router counts per minute: a few seconds' wait usually gets through. */
const RETRY_S = 8;
/** How far from a road a point may be and still be routed (to the nearest road). */
const SNAP_M = 3000;
/** The last stretch starts on a road and ends at the parking, both close to a way. */
const TAIL_SNAP_M = 300;

/** A parking's last stretch, shared by every drive to it that stops at the same road point. */
function tailStore(req: Request): TailStore {
  const json = edgeJson<KnownTail[]>(new URL(req.url).origin, "/api/drive/tail", DAY_S);
  return { get: (to: Pt) => json.get(String(to)), put: (to: Pt, tails: KnownTail[]) => json.put(String(to), tails) };
}

function parsePoint(raw: string | null, round: (n: number) => number): [number, number] | null {
  if (!raw) return null;
  const [lat, lon] = raw.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < AREA.minLat || lat > AREA.maxLat || lon < AREA.minLon || lon > AREA.maxLon) return null;
  return [round(lat), round(lon)];
}

export async function GET(req: Request) {
  if (fromOtherSite(req)) return OTHER_SITE();
  const params = new URL(req.url).searchParams;
  // The visitor's start stays coarse (~100 m, never an exact home); the parking is a public place.
  const from = parsePoint(params.get("from"), roundCoord);
  const to = parsePoint(params.get("to"), (n) => Math.round(n * 1e5) / 1e5);
  if (!from || !to) {
    return Response.json({ error: "from/to must be lat,lon in or near Slovakia" }, { status: 400 });
  }

  // Same places, same answer for everyone: Cloudflare keeps it a day, the router is asked once.
  // Keyed on the rounded places, so extra query parameters can't skip the cache.
  const cacheKey = { from: from.join(","), to: to.join(",") };
  return withEdgeCache(req, DAY_S, async () => {
    // A new route spends router quota: only so many a minute per visitor.
    const limited = await overRouteLimit(req);
    if (limited) return limited;
    try {
      const key = process.env.ORS_API_KEY;
      const road = await driveRoute(key, from, to, SNAP_M);
      let partial = false;
      const store = tailStore(req);
      const ask = (a: Pt, b: Pt) => lastStretch(key, a, b, TAIL_SNAP_M);
      const full = await finishDrive(road, to, (a, b) => knownTail(a, b, ask, store), () => (partial = true));
      const route = { ...full, points: simplifyLine(full.points, SHAPE_TOL_M) };
      const keepS = partial ? PARTIAL_S : DAY_S;
      return Response.json(route, {
        headers: {
          "Cache-Control": `public, s-maxage=${keepS}, stale-while-revalidate=${keepS}`,
          ...(partial ? { [KEEP_FOR]: String(PARTIAL_S) } : {}),
        },
      });
    } catch (err) {
      console.error("drive route failed", err);
      // The router's per-minute limit: say when to ask again (the page waits and retries once).
      if (err instanceof RateLimited) {
        return Response.json({ error: "Trasu autom sa nepodarilo vypočítať." }, { status: 503, headers: { "Retry-After": String(RETRY_S) } });
      }
      return Response.json({ error: "Trasu autom sa nepodarilo vypočítať." }, { status: 502 });
    }
  }, cacheKey);
}
