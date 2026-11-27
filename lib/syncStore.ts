import { accountDb } from "@/lib/auth";
import { MAX_PLANS, MAX_VISITS, SEND_BUDGET, cleanItem, decide } from "@/lib/syncMerge";
import type { Held, KindAnswer, SyncAnswer, SyncKind, SyncRequest, WireItem } from "@/lib/syncMerge";

// Account sync on the server (see lib/syncMerge.ts for the rule): one call carries what a device
// has, stores what is newer than the server's copy and answers with what the device is missing.
// Tables are made by lib/auth.ts (account_item).

const WRITE_CHUNK = 20;
const READ_CHUNK = 50;

// A device still on the previous version changes a visit and sends it back without `how`; that must not wipe the
// stored one, so a newer visit body without `how` takes the stored `how` along (one statement, no extra read).
const BODY = `CASE WHEN excluded.kind = 'visit' AND excluded.body IS NOT NULL AND json_extract(excluded.body, '$.how') IS NULL AND json_extract(account_item.body, '$.how') IS NOT NULL THEN json_set(excluded.body, '$.how', json(json_extract(account_item.body, '$.how'))) ELSE excluded.body END`;

interface Row { key: string; at: number; gone: number; body: string | null }

const empty = (): KindAnswer => ({ send: [], want: [], at: {} });

/** The part of one kind's merge that happens before bodies are read for the answer. */
interface Merged { answer: KindAnswer; sendKeys: string[]; held: Map<string, Held> }

async function mergeKind(d: NonNullable<Awaited<ReturnType<typeof accountDb>>>, accountId: string, kind: SyncKind, raw: unknown, partial: boolean, now: number, max: number): Promise<Merged> {
  const answer = empty();
  // Items past the cap are ignored, not an error: the rest of the list still counts.
  const items: WireItem[] = [];
  const sentAt = new Map<WireItem, number>();
  if (Array.isArray(raw)) {
    for (const r of raw) {
      const item = cleanItem(kind, r, now);
      if (!item) continue;
      items.push(item);
      sentAt.set(item, (r as { at: number }).at);
    }
  }
  const list = items.slice(0, max);
  const rows = await d.prepare(`SELECT key, at, gone, COALESCE(length(body), 0) AS size FROM account_item WHERE account = ? AND kind = ?`).bind(accountId, kind).all<{ key: string; at: number; gone: number; size: number }>();
  const held = new Map<string, Held>(rows.results.map((r) => [r.key, { at: r.at, gone: r.gone === 1, size: r.size }]));
  const { store, sendKeys, want } = decide(list, held, partial);
  answer.want = want;

  let count = held.size;
  const writes: WireItem[] = [];
  for (const item of store) {
    if (!held.has(item.key)) {
      // A full account takes no new keys; existing ones still update.
      if (count >= max) continue;
      count++;
    }
    writes.push(item);
  }
  const upsert = `INSERT INTO account_item (account, kind, key, at, gone, body) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (account, kind, key) DO UPDATE SET at = excluded.at, gone = excluded.gone, body = ${BODY} WHERE excluded.at > account_item.at`;
  for (let i = 0; i < writes.length; i += WRITE_CHUNK) {
    await d.batch(
      writes.slice(i, i + WRITE_CHUNK).map((w) => d.prepare(upsert).bind(accountId, kind, w.key, w.at, w.gone ? 1 : 0, w.gone ? null : JSON.stringify(w.body))),
    );
  }
  // An `at` the server clamped is told back, so the device can correct its copy.
  const wanted = new Set(want);
  const written = new Set(writes);
  const refused = new Set(store.filter((s) => !written.has(s)).map((s) => s.key));
  for (const item of list) if (item.at !== sentAt.get(item) && !wanted.has(item.key) && !refused.has(item.key)) answer.at[item.key] = item.at;
  return { answer, sendKeys, held };
}

/** Takes what a device has and answers with what it is missing (bodies in rounds of at most SEND_BUDGET characters). */
export async function syncAccount(accountId: string, req: SyncRequest, now = Date.now(), max: Record<SyncKind, number> = { plan: MAX_PLANS, visit: MAX_VISITS }): Promise<SyncAnswer> {
  const d = await accountDb();
  if (!d) throw new Error("no database");
  const partial = req.partial === true;
  const plans = await mergeKind(d, accountId, "plan", req.plans, partial, now, max.plan);
  const visits = await mergeKind(d, accountId, "visit", req.visits, partial, now, max.visit);

  // Pick what fits the budget from the sizes already known, then read just those bodies.
  let used = 0;
  let more = false;
  const picked: { kind: SyncKind; keys: string[] }[] = [];
  for (const [kind, m] of [["plan", plans], ["visit", visits]] as const) {
    const keys: string[] = [];
    for (const key of m.sendKeys) {
      if (used > SEND_BUDGET) {
        more = true;
        break;
      }
      keys.push(key);
      used += m.held.get(key)?.size ?? 0;
    }
    picked.push({ kind, keys });
  }
  for (const { kind, keys } of picked) {
    const out = kind === "plan" ? plans.answer : visits.answer;
    const got = new Map<string, Row>();
    for (let i = 0; i < keys.length; i += READ_CHUNK) {
      const part = keys.slice(i, i + READ_CHUNK);
      const rows = await d
        .prepare(`SELECT key, at, gone, body FROM account_item WHERE account = ? AND kind = ? AND key IN (${part.map(() => "?").join(",")})`)
        .bind(accountId, kind, ...part)
        .all<Row>();
      for (const r of rows.results) got.set(r.key, r);
    }
    for (const key of keys) {
      const r = got.get(key);
      if (!r) continue;
      out.send.push(r.gone === 1 || r.body === null ? { key, at: r.at, gone: true } : { key, at: r.at, body: JSON.parse(r.body) });
    }
  }
  return { ok: true, now, more, plans: plans.answer, visits: visits.answer };
}

/** Totals for /statistiky: accounts with something saved, live plans and live visits. Nothing per account. */
export async function syncTotals(): Promise<{ accounts: number; plans: number; visits: number } | null> {
  const d = await accountDb().catch(() => null);
  if (!d) return null;
  const row = await d
    .prepare(`SELECT COUNT(DISTINCT account) AS accounts, COALESCE(SUM(kind = 'plan'), 0) AS plans, COALESCE(SUM(kind = 'visit'), 0) AS visits FROM account_item WHERE gone = 0`)
    .first<{ accounts: number; plans: number; visits: number }>();
  return { accounts: row?.accounts ?? 0, plans: row?.plans ?? 0, visits: row?.visits ?? 0 };
}

