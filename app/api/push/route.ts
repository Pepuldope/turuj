import { refuseOnPreview } from "@/lib/previewGuard";
import { getDb } from "@/lib/d1";
import { REMINDER_KINDS, cancelEve, cancelReminders, cleanName, eveText, messageFor, planEve, planReminders, vapidKeys } from "@/lib/pushPlan";
import type { PlanItem, ReminderKind } from "@/lib/pushPlan";
import { eveAtFor } from "@/lib/eve";
import type { EveJob } from "@/lib/eve";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overCallLimit } from "@/lib/routeGuard";
import { isPushEndpoint, sendPush, vapidPublicKey } from "@/lib/webPush";
import type { PushSub } from "@/lib/webPush";

// Reminders during a walk (lib/pushPlan.ts). GET: the key the browser subscribes with.
// POST {action: "plan" | "cancel" | "test", sub, slug, ...}: our pages only, a few calls a minute.

const MAX_BODY = 3000;
const NO_DB = () => Response.json({ error: "Pripomienky teraz nefungujú." }, { status: 503 });

export async function GET(request: Request): Promise<Response> {
  // The first call makes and stores the signing key: a write.
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  const db = await getDb();
  if (!db) return NO_DB();
  return Response.json({ key: vapidPublicKey(await vapidKeys(db)) });
}

function subOf(v: unknown): PushSub | null {
  const s = v as PushSub | null;
  if (!s || typeof s.endpoint !== "string" || !isPushEndpoint(s.endpoint)) return null;
  if (typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return null;
  if (s.keys.p256dh.length > 200 || s.keys.auth.length > 100 || s.endpoint.length > 1000) return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

/** The evening reminder's job, checked: numbers in Slovakia, a few short dates, a plain name. */
function eveJob(b: Record<string, unknown>, slug: string, lang: "sk" | "en"): EveJob | null {
  const j = b.job as Record<string, unknown> | undefined;
  if (!j) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const lat = n(j.lat);
  const lon = n(j.lon);
  const from = n(j.from);
  const to = n(j.to);
  const leave = j.leave === null || j.leave === undefined ? null : n(j.leave);
  if (lat === null || lon === null || from === null || to === null || to < from) return null;
  if (lat < 47 || lat > 50 || lon < 16 || lon > 23) return null;
  const closed = (Array.isArray(j.closedUntil) ? j.closedUntil : []).filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 5);
  return { name: cleanName(b.name), slug, lang, lat, lon, from, to, leave, closedUntil: closed };
}

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  if (await overCallLimit(request, "push")) return TOO_MANY();
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) throw new Error("too long");
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const sub = subOf(body.sub);
  const slug = typeof body.slug === "string" && /^[a-z0-9-]{1,120}$/.test(body.slug) ? body.slug : null;
  if (!sub || !slug) return Response.json({ error: "bad request" }, { status: 400 });
  const lang = body.lang === "en" ? "en" : "sk";
  const db = await getDb();
  if (!db) return NO_DB();
  try {
    if (body.action === "cancel") {
      const kind = REMINDER_KINDS.includes(body.kind as ReminderKind) ? (body.kind as ReminderKind) : undefined;
      await cancelReminders(db, sub.endpoint, slug, kind);
      return Response.json({ ok: true });
    }
    if (body.action === "test") {
      const got = await sendPush(sub, JSON.stringify(messageFor("test", "", slug, Date.now(), lang)), await vapidKeys(db));
      return Response.json({ ok: got === "ok" });
    }
    if (body.action === "eve" || body.action === "eve-test") {
      const job = eveJob(body, slug, lang);
      const date = typeof body.date === "string" ? body.date : "";
      if (!job) return Response.json({ error: "bad request" }, { status: 400 });
      if (body.action === "eve-test") {
        // Only ever to the asker's own phone: shows the message as it would arrive, right now.
        const got = await sendPush(sub, await eveText(job), await vapidKeys(db));
        return Response.json({ ok: got === "ok" });
      }
      const at = eveAtFor(date);
      if (at === null) return Response.json({ error: "bad request" }, { status: 400 });
      return Response.json({ planned: await planEve(db, sub, job, at) });
    }
    if (body.action === "eve-cancel") {
      await cancelEve(db, sub.endpoint, slug);
      return Response.json({ ok: true });
    }
    if (body.action === "plan") {
      const items: PlanItem[] = (Array.isArray(body.items) ? body.items : [])
        .map((i: { kind?: unknown; at?: unknown }) => ({ kind: i?.kind as ReminderKind, at: Number(i?.at) }))
        .filter((i: PlanItem) => Number.isFinite(i.at));
      const planned = await planReminders(db, sub, slug, cleanName(body.name), items, lang);
      return Response.json({ planned });
    }
  } catch (err) {
    console.warn("[push] failed:", err);
    return Response.json({ error: "Pripomienky sa teraz nepodarilo nastaviť." }, { status: 503 });
  }
  return Response.json({ error: "bad request" }, { status: 400 });
}
