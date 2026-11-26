import { ownReviews } from "@/lib/reviews";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overReadLimit } from "@/lib/routeGuard";
import { isBot } from "@/lib/visitDays";

// The reviews this browser sent, by trip (Peter, 26 Nov 2026): a visited trip's row shows how the visitor rated
// it and the rating window opens with the old answers, and reviews sent before the browser started keeping its
// own copy are asked for once (lib/reviewed.ts).
// The browser sends the random id it reviews under; the id goes in the body, so it is in no address or log.
// It only reads, so a preview answers too (a preview shares the live database).

const MAX_BODY = 200;

export async function POST(request: Request): Promise<Response> {
  if (isBot(request.headers.get("user-agent") ?? "") || fromOtherSite(request)) return OTHER_SITE();
  if (await overReadLimit(request, "reviews")) return TOO_MANY();
  let reviewer: unknown = null;
  try {
    const raw = await request.text();
    if (raw.length <= MAX_BODY) reviewer = (JSON.parse(raw) as { reviewer?: unknown } | null)?.reviewer;
  } catch {
    reviewer = null;
  }
  try {
    const reviews = await ownReviews(reviewer);
    if (!reviews) return Response.json({ error: "bad reviewer" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return Response.json({ reviews }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.warn("[review] own reviews failed:", err);
    return Response.json({ error: "later" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
