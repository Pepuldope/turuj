// Calm reminders during a walk (C10 B, Peter 2026-10-29: "make it not spam you and be chill").
// At most two per trip, both planned when the group turns them on in the trail screen:
//   turn:   when it's time to be at the goal to get back before dark (dropped once they are there),
//   sunset: 45 minutes before sunset, if the trip hasn't been ended.
// The phone gets nothing else. Kept in the D1 database; a Cloudflare cron (worker.ts) sends them.
import type { D1Like } from "@/lib/d1";
import { clockShort } from "@/lib/zoned";
import { newVapidKeys, sendPush } from "@/lib/webPush";
import type { PushSub, VapidKeys } from "@/lib/webPush";
import { EVE_MAX_AHEAD_MS, eveMessage } from "@/lib/eve";
import type { EveJob } from "@/lib/eve";
import { fetchForecast } from "@/lib/met";

export type ReminderKind = "turn" | "sunset";
export const REMINDER_KINDS: readonly ReminderKind[] = ["turn", "sunset"];
/** The evening before the trip (lib/eve.ts): planned and cancelled on its own, apart from the walk's two. */
const EVE = "eve";
/** How long before sunset the sunset reminder comes. */
export const SUNSET_LEAD_MIN = 45;
/** A reminder further ahead than this is not about today's walk. */
const MAX_AHEAD_MS = 16 * 3600_000;
/** The cron runs every 5 minutes: send what falls due before the next run, a little early beats late. */
const SEND_AHEAD_MS = 150_000;
/** A reminder this late (the cron missed it) is useless: drop it quietly. */
const STALE_MS = 30 * 60_000;
/** The evening-before reminder is still welcome a few hours after 19:00, so a queue of them can spread over many runs. */
const EVE_STALE_MS = 3 * 3600_000;
/**
 * At most this many sends per run (a Worker may make only so many outgoing calls per run; the
 * evening reminders of everyone fall at 19:00). What is left stays in the table for the next run
 * five minutes later, so nothing is lost while it is still fresh.
 */
export const MAX_SENDS_PER_RUN = 50;
/** Rows looked at per run: room for stale ones to be cleared without using up the sends. */
const LOOK_AT = 200;

const staleMs = (kind: string) => (kind === EVE ? EVE_STALE_MS : STALE_MS);

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS push_plan (endpoint TEXT NOT NULL, slug TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, sub TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY (endpoint, slug, kind)) WITHOUT ROWID`,
  `CREATE INDEX IF NOT EXISTS push_plan_at ON push_plan (at)`,
  // The VAPID key pair the site signs its messages with: made on first use, never leaves the database.
  `CREATE TABLE IF NOT EXISTS push_key (id INTEGER PRIMARY KEY, jwk TEXT NOT NULL)`,
];

async function ensure(db: D1Like) {
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
}

export async function vapidKeys(db: D1Like): Promise<VapidKeys> {
  await ensure(db);
  const row = await db.prepare(`SELECT jwk FROM push_key WHERE id = 1`).first<{ jwk: string }>();
  if (row) return { privateJwk: JSON.parse(row.jwk) };
  const fresh = await newVapidKeys();
  // Two first calls at once: the first insert wins, both read it back.
  await db.prepare(`INSERT OR IGNORE INTO push_key (id, jwk) VALUES (1, ?)`).bind(JSON.stringify(fresh.privateJwk)).run();
  const kept = await db.prepare(`SELECT jwk FROM push_key WHERE id = 1`).first<{ jwk: string }>();
  return { privateJwk: JSON.parse(kept!.jwk) };
}

export interface Message {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Same tag: a newer one replaces the older on the phone instead of stacking. */
  tag: string;
}

/** The texts, written here and not by the page, so a reminder always reads the same. */
export function messageFor(kind: ReminderKind | "test", name: string, slug: string, at: number, lang: "sk" | "en"): Message {
  const url = `${lang === "en" ? "/en" : ""}/ulozene?na-trase=${encodeURIComponent(slug)}`;
  const tag = `turuj-${slug}`;
  const sk = lang === "sk";
  if (kind === "turn")
    return {
      title: sk ? `Čas na návrat · ${name}` : `Time to head back · ${name}`,
      body: sk
        ? "Ak chcete byť späť za svetla, je čas otočiť sa. Ak už idete dole, všetko je v poriadku."
        : "To be back before dark, it's time to turn around. If you're already on your way back, all good.",
      url,
      tag,
    };
  if (kind === "sunset")
    return {
      title: sk ? `Slnko zapadá o ${clockShort(at + SUNSET_LEAD_MIN * 60_000)}` : `Sunset at ${clockShort(at + SUNSET_LEAD_MIN * 60_000)}`,
      body: sk ? "Ak ste ešte na trase, majte poruke čelovku." : "If you're still on the trail, keep a head torch handy.",
      url,
      tag,
    };
  return {
    title: sk ? "Pripomienky sú zapnuté" : "Reminders are on",
    body: sk ? "Počas výletu vám napíšeme najviac dvakrát: kedy sa otočiť a pred západom slnka." : "During the trip we'll write at most twice: when to turn back and before sunset.",
    url,
    tag: `${tag}-test`,
  };
}

/** Trip names come from the page: keep them short and plain. */
export function cleanName(name: unknown): string {
  return String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 60);
}

export interface PlanItem {
  kind: ReminderKind;
  at: number;
}

/** Replaces this trip's reminders for this phone. Items in the past or too far ahead are dropped. */
export async function planReminders(db: D1Like, sub: PushSub, slug: string, name: string, items: PlanItem[], lang: "sk" | "en", now = Date.now()) {
  await ensure(db);
  const keep = items.filter((i) => REMINDER_KINDS.includes(i.kind) && i.at > now && i.at < now + MAX_AHEAD_MS).slice(0, REMINDER_KINDS.length);
  await db.batch([
    db.prepare(`DELETE FROM push_plan WHERE endpoint = ? AND slug = ? AND kind != ?`).bind(sub.endpoint, slug, EVE),
    ...keep.map((i) =>
      db
        .prepare(`INSERT OR REPLACE INTO push_plan (endpoint, slug, kind, at, sub, message) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(sub.endpoint, slug, i.kind, i.at, JSON.stringify(sub), JSON.stringify(messageFor(i.kind, name, slug, i.at, lang)))
    ),
  ]);
  return keep.length;
}

/** Drops reminders: one kind (the goal was reached: no "turn back") or all of the trip's (ended). */
export async function cancelReminders(db: D1Like, endpoint: string, slug: string, kind?: ReminderKind) {
  await ensure(db);
  if (kind) await db.prepare(`DELETE FROM push_plan WHERE endpoint = ? AND slug = ? AND kind = ?`).bind(endpoint, slug, kind).run();
  else await db.prepare(`DELETE FROM push_plan WHERE endpoint = ? AND slug = ? AND kind != ?`).bind(endpoint, slug, EVE).run();
}

/** The evening-before reminder for this phone and trip. The message column holds the job; the text is made when it is sent. */
export async function planEve(db: D1Like, sub: PushSub, job: EveJob, at: number, now = Date.now()): Promise<boolean> {
  await ensure(db);
  await db.prepare(`DELETE FROM push_plan WHERE endpoint = ? AND slug = ? AND kind = ?`).bind(sub.endpoint, job.slug, EVE).run();
  if (!(at > now && at < now + EVE_MAX_AHEAD_MS)) return false;
  await db
    .prepare(`INSERT OR REPLACE INTO push_plan (endpoint, slug, kind, at, sub, message) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(sub.endpoint, job.slug, EVE, at, JSON.stringify(sub), JSON.stringify(job))
    .run();
  return true;
}

export async function cancelEve(db: D1Like, endpoint: string, slug: string) {
  await ensure(db);
  await db.prepare(`DELETE FROM push_plan WHERE endpoint = ? AND slug = ? AND kind = ?`).bind(endpoint, slug, EVE).run();
}

/** MET asks places at 2 decimals (~1 km, like /api/weather): nearby trips share one cached answer. */
export async function eveText(job: EveJob): Promise<string> {
  const forecast = await fetchForecast(job.lat.toFixed(2), job.lon.toFixed(2), "");
  return JSON.stringify(eveMessage(job, forecast));
}

interface Row {
  endpoint: string;
  slug: string;
  kind: string;
  at: number;
  sub: string;
  message: string;
}

/** The cron's job: send what is due, forget what is stale or whose phone unsubscribed. */
export async function sendDue(db: D1Like, now = Date.now()): Promise<{ sent: number; dropped: number }> {
  await ensure(db);
  const { results } = await db.prepare(`SELECT * FROM push_plan WHERE at <= ? ORDER BY at LIMIT ${LOOK_AT}`).bind(now + SEND_AHEAD_MS).all<Row>();
  if (results.length === 0) return { sent: 0, dropped: 0 };
  const keys = await vapidKeys(db);
  let sent = 0;
  let dropped = 0;
  let attempts = 0;
  for (const r of results) {
    const stale = r.at < now - staleMs(r.kind);
    // Over the cap: leave it in the table for the next run (stale ones above are still cleared).
    if (!stale && attempts >= MAX_SENDS_PER_RUN) continue;
    await db.prepare(`DELETE FROM push_plan WHERE endpoint = ? AND slug = ? AND kind = ?`).bind(r.endpoint, r.slug, r.kind).run();
    if (stale) {
      dropped++;
      continue;
    }
    attempts++;
    let text = r.message;
    if (r.kind === EVE) {
      try {
        text = await eveText(JSON.parse(r.message) as EveJob);
      } catch {
        dropped++;
        continue;
      }
    }
    const got = await sendPush(JSON.parse(r.sub) as PushSub, text, keys, now);
    if (got === "ok") {
      sent++;
      if (r.kind === EVE) console.log("[push] eve sent");
    }
    if (got === "gone") await db.prepare(`DELETE FROM push_plan WHERE endpoint = ?`).bind(r.endpoint).run();
  }
  return { sent, dropped };
}
