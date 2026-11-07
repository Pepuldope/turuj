import { fromOtherSite, overCallLimit } from "@/lib/routeGuard";
import { clientIp, isBot, localDay, visitorHash } from "@/lib/visitDays";
import { monthSalt, recordVisitDay } from "@/lib/visitStore";

// Records "this visitor came today" (one row per visitor per day) so
// /statistiky can count people with 4+ visit days a month. Called once per
// page load by components/VisitBeacon.tsx, and again with ?used=1 when the visitor opens a trip page
// or saves a trip (lib/analytics.ts): that day then counts as a "use day" too. Without the Cloudflare database
// (local dev, Vercel) it does nothing.
//
// Each count is a database write, and the free plan has 100,000 a day shared
// with the trip data. Calls from other sites' pages and made-up browser names
// are dropped, and one address gets 60 a minute (lib/routeGuard.ts): enough
// for a whole class behind one school address (a repeat visit the same day
// writes nothing), not enough for a script to spend the day's writes.

/** Longer browser names are made up; real ones are a few hundred characters. */
const MAX_UA = 512;

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request.headers);
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!ip || isBot(userAgent) || userAgent.length > MAX_UA || fromOtherSite(request) || (await overCallLimit(request, "visit"))) {
    return new Response(null, { status: 204 });
  }

  try {
    const day = localDay(new Date());
    const salt = await monthSalt(day.slice(0, 7));
    if (salt) await recordVisitDay(await visitorHash(salt, day, ip, userAgent), day, new URL(request.url).searchParams.get("used") === "1");
  } catch (err) {
    console.warn("[visit] not recorded:", err);
  }

  return new Response(null, { status: 204 });
}
