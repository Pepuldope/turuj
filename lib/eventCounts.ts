import { getDb } from "@/lib/d1";

// Monthly totals of the few actions behind the goals in /statistiky and the
// monthly report (activation, two-minute share, growth loop): one counter row
// per month, action and detail. Nothing about who did it. Umami counts the same
// events, but its free plan has no export, so these are the numbers we keep.

/** The counted actions and the details each may carry ("" = none). */
export const COUNTED: Record<string, readonly string[]> = {
  start_set: ["gps", "manual", "remembered"],
  trip_saved: ["0-2 min", "2-5 min", "5-15 min", "15+ min"],
  share_sent: ["0-2 min", "2-5 min", "5-15 min", "15+ min"],
  shared_open: [""],
  nav_open: [""],
  plus_want: [""],
  plus_no: [""],
  plan_commit: ["save", "share", "nav", "gpx"],
  heard_from: ["google", "ai", "facebook", "instagram", "tiktok", "kamarat", "skola", "klub", "ine"],
};

/** The detail stored for this action, or null when the pair isn't one we count. */
export function countedDetail(name: unknown, detail: unknown): string | null {
  if (typeof name !== "string" || !Object.hasOwn(COUNTED, name)) return null;
  const d = typeof detail === "string" ? detail : "";
  return COUNTED[name].includes(d) ? d : null;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS event_month (month TEXT NOT NULL, name TEXT NOT NULL, detail TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (month, name, detail)) WITHOUT ROWID`;
let ready: Promise<unknown> | null = null;

export async function countEvent(month: string, name: string, detail: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  ready ??= db
    .prepare(SCHEMA)
    .run()
    .catch((err) => {
      ready = null;
      throw err;
    });
  await ready;
  await db
    .prepare(
      `INSERT INTO event_month (month, name, detail, n) VALUES (?1, ?2, ?3, 1)
       ON CONFLICT (month, name, detail) DO UPDATE SET n = n + 1`
    )
    .bind(month, name, detail)
    .run();
}

export interface MonthEvents {
  month: string;
  /** Visits where the start was known. */
  starts: number;
  saved: number;
  sent: number;
  /** Plans sent within two minutes of landing. */
  sentFast: number;
  friendOpens: number;
  navigations: number;
  /** /plus price test: "Chcel by som to" and "Za túto cenu nie" taps. */
  plusWant: number;
  plusNo: number;
  /** North Star: planned trips (one per trail per page load). */
  planned: number;
  /** "Ako ste sa o nás dozvedeli?" answers by channel. */
  heardFrom: Record<string, number>;
}

/** Totals per month, newest first; null without the database. */
export async function monthlyEvents(): Promise<MonthEvents[] | null> {
  const db = await getDb();
  if (!db) return null;
  let rows: { month: string; name: string; detail: string; n: number }[];
  try {
    ({ results: rows } = await db
      .prepare(`SELECT month, name, detail, n FROM event_month ORDER BY month DESC`)
      .all<{ month: string; name: string; detail: string; n: number }>());
  } catch {
    return []; // No action counted yet: the table doesn't exist.
  }
  const months = new Map<string, MonthEvents>();
  for (const r of rows) {
    const m =
      months.get(r.month) ??
      { month: r.month, starts: 0, saved: 0, sent: 0, sentFast: 0, friendOpens: 0, navigations: 0, plusWant: 0, plusNo: 0, planned: 0, heardFrom: {} };
    months.set(r.month, m);
    if (r.name === "start_set") m.starts += r.n;
    else if (r.name === "trip_saved") m.saved += r.n;
    else if (r.name === "share_sent") {
      m.sent += r.n;
      if (r.detail === "0-2 min") m.sentFast += r.n;
    } else if (r.name === "shared_open") m.friendOpens += r.n;
    else if (r.name === "nav_open") m.navigations += r.n;
    else if (r.name === "plus_want") m.plusWant += r.n;
    else if (r.name === "plus_no") m.plusNo += r.n;
    else if (r.name === "plan_commit") m.planned += r.n;
    else if (r.name === "heard_from") m.heardFrom[r.detail] = (m.heardFrom[r.detail] ?? 0) + r.n;
  }
  return [...months.values()];
}
