import { withEdgeCache } from "@/lib/edgeCache";
import { accountStats } from "@/lib/auth";
import { monthlyEvents, recentDayEvents } from "@/lib/eventCounts";
import { monthlyStats } from "@/lib/visitStore";

/**
 * GET /api/statistiky -> { months, events, accounts, days }: the numbers on /statistiky.
 * Read by that page in the browser, so the page itself stays a prebuilt file:
 * drawing it on the server for every visit runs over the free plan's CPU time.
 * null means no database (local dev). Cloudflare keeps an answer five minutes:
 * the totals read every visit row of the month, and the page already says the
 * running month fills in as it goes.
 */
const KEEP_S = 300;

export async function GET(req: Request) {
  return withEdgeCache(req, KEEP_S, async () => {
    const [months, events, accounts, days] = await Promise.all([monthlyStats(), monthlyEvents(), accountStats().catch(() => null), recentDayEvents(14)]);
    return Response.json({ months, events, accounts, days }, { headers: { "Cache-Control": `public, s-maxage=${KEEP_S}` } });
  }, {});
}
