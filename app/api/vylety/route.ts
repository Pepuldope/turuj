import { addDaysIso, daysBetween } from "@/lib/days";
import { withEdgeCache } from "@/lib/edgeCache";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overCallLimit } from "@/lib/routeGuard";
import { listTrips } from "@/lib/tripDb";
import { getTowns } from "@/lib/trips";

/**
 * GET /api/vylety?z=<town>&den=YYYY-MM-DD&limit=N -> { trips, zdroj, generated_at }
 *
 * The trip list from the deployed files:
 * with a start town (an id from data/towns.json, e.g. "zilina") nearest
 * first by drive there and back plus the walk, else best known first. `closed`
 * marks trips a closure rule covers on `den` (default today, at most
 * MAX_DAYS_AHEAD ahead).
 *
 * Every new answer works through the whole trip list (from the deployed files
 * since 3 Nov: from the database it read about 17,000 rows each, and the free
 * plan has 5 million a day). Still: only real days near today, a few fixed list
 * lengths, and a per-address limit on new answers, for the Worker's CPU.
 */

const MAX_LIMIT = 500;
/** Lists are computed at one of these lengths and cut to the asked one, so other lengths share the cache. */
const LIMIT_STEPS = [10, 50, 100, MAX_LIMIT];
const MAX_DAYS_AHEAD = 30;
const HOUR_S = 3600;

function todayInSlovakia(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bratislava" });
}

export async function GET(req: Request) {
  if (fromOtherSite(req)) return OTHER_SITE();
  const params = new URL(req.url).searchParams;
  const town = params.get("z");
  const date = params.get("den") ?? todayInSlovakia();
  const limit = Number(params.get("limit") ?? MAX_LIMIT);

  if (town !== null && !getTowns().some((t) => t.id === town)) {
    return Response.json({ error: "z: neznáme mesto, napr. z=bratislava" }, { status: 400 });
  }
  const ahead = /^\d{4}-\d{2}-\d{2}$/.test(date) && addDaysIso(date, 0) === date ? daysBetween(todayInSlovakia(), date) : NaN;
  if (!(ahead >= -1 && ahead <= MAX_DAYS_AHEAD)) {
    return Response.json({ error: `den: YYYY-MM-DD, dnes až o ${MAX_DAYS_AHEAD} dní` }, { status: 400 });
  }
  if (!Number.isInteger(limit) || limit < 1) return Response.json({ error: "limit: kladné celé číslo" }, { status: 400 });

  // Cloudflare keeps each answer an hour; the asked length is cut from the cached one.
  const capped = Math.min(limit, MAX_LIMIT);
  const step = LIMIT_STEPS.find((n) => n >= capped) ?? MAX_LIMIT;
  const res = await withEdgeCache(req, HOUR_S, async () => {
    if (await overCallLimit(req, "vylety")) return TOO_MANY();
    const { trips, source, generated_at } = await listTrips({ town, date, limit: step });
    return Response.json(
      { zdroj: source, generated_at, count: trips.length, trips },
      { headers: { "Cache-Control": `public, s-maxage=${HOUR_S}, stale-while-revalidate=${HOUR_S}`, "X-Zdroj": source } }
    );
  }, { z: town ?? "", den: date, limit: String(step) });
  if (!res.ok || step === capped) return res;
  const body = (await res.json()) as { trips: unknown[]; count: number };
  const trips = body.trips.slice(0, capped);
  const headers = new Headers(res.headers);
  headers.delete("Content-Length");
  return Response.json({ ...body, count: trips.length, trips }, { headers });
}
