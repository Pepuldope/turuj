import { refuseOnPreview } from "@/lib/previewGuard";
import { parseFeedback, saveFeedback } from "@/lib/feedback";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overCallLimit } from "@/lib/routeGuard";
import { isBot } from "@/lib/visitDays";

// "Napíšte nám" and "Nahlásiť chybu" (lib/feedback.ts). Same guards as the reviews: our pages only,
// and only so many messages a minute from one address (the address itself is never stored).

const MAX_BODY = 4000;

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (isBot(request.headers.get("user-agent") ?? "") || fromOtherSite(request)) return OTHER_SITE();
  if (await overCallLimit(request, "feedback")) return TOO_MANY();
  let message = null;
  try {
    const raw = await request.text();
    if (raw.length <= MAX_BODY) message = parseFeedback(JSON.parse(raw));
  } catch {
    message = null;
  }
  if (!message) return Response.json({ error: "Správa sa nedá uložiť." }, { status: 400 });
  try {
    const saved = await saveFeedback(message, new Date());
    return Response.json({ saved });
  } catch (err) {
    console.warn("[feedback] not saved:", err);
    return Response.json({ error: "Správu sa teraz nepodarilo uložiť, skúste neskôr." }, { status: 503 });
  }
}
