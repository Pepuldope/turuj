import { weatherKey } from "@/lib/apiKeys";
import { withEdgeCache } from "@/lib/edgeCache";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overReadLimit } from "@/lib/routeGuard";
import { MET_TIMEOUT_MS, MET_UA, metUrl, trimMetStep } from "@/lib/met";
import type { MetStep } from "@/lib/met";
import type { WeatherForecast } from "@/lib/weather";

/**
 * GET /api/weather?lat=..&lon=..[&alt=metres] -> WeatherForecast
 *
 * MET Norway Locationforecast 2.0 (CC BY 4.0). Their terms: identify the app
 * in User-Agent, at most 4 decimals, cache, never call it straight from the
 * browser. Trail starts and summits are public places, so nothing personal
 * is sent. `alt` corrects the temperature for a summit's height.
 *
 * MET's grid is 2.5 km, so places are snapped to ~1 km and heights to 10 m:
 * nearby trips share one cached forecast and MET is asked far less often.
 */

const CACHE_S = 1800;

export async function GET(req: Request) {
  // Each new answer is a call to MET in our name: only for our pages, and only so many a minute.
  if (fromOtherSite(req)) return OTHER_SITE();
  const key = weatherKey(new URL(req.url).searchParams);
  if (!key) return Response.json({ error: "lat/lon in Slovakia, alt 0..3000" }, { status: 400 });

  const url = metUrl(key.lat, key.lon, key.alt);
  return withEdgeCache(req, CACHE_S, async () => ((await overReadLimit(req, "weather")) ? TOO_MANY() : forecast(url)), key);
}

async function forecast(url: string): Promise<Response> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": MET_UA }, signal: AbortSignal.timeout(MET_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`MET ${res.status}`);
    const data = await res.json();
    const body: WeatherForecast = {
      updated: data.properties?.meta?.updated_at ?? "",
      steps: ((data.properties?.timeseries ?? []) as MetStep[]).map(trimMetStep),
    };
    return Response.json(body, {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S}` },
    });
  } catch (err) {
    console.error("weather failed", err);
    return Response.json({ error: "Predpoveď počasia sa nepodarilo načítať." }, { status: 502 });
  }
}
