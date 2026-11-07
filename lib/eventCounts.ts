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
  gpx_download: [""],
  on_trail: [""],
  list_empty: [""],
  // How long a planned trip took after landing (every plan_commit, whatever the action).
  plan_took: ["0-2 min", "2-5 min", "5-15 min", "15+ min"],
  heard_from: ["google", "ai", "facebook", "instagram", "tiktok", "kamarat", "skola", "klub", "ine"],
};

/** The detail stored for this action, or null when the pair isn't one we count. */
export function countedDetail(name: unknown, detail: unknown): string | null {
  if (typeof name !== "string" || !Object.hasOwn(COUNTED, name)) return null;
  const d = typeof detail === "string" ? detail : "";
  return COUNTED[name].includes(d) ? d : null;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS event_month (month TEXT NOT NULL, name TEXT NOT NULL, detail TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (month, name, detail)) WITHOUT ROWID`;
// The same counters per day (the last weeks for /statistiky; the monthly table stays the long record).
const DAY_SCHEMA = `CREATE TABLE IF NOT EXISTS event_day (day TEXT NOT NULL, name TEXT NOT NULL, detail TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, name, detail)) WITHOUT ROWID`;
let ready: Promise<unknown> | null = null;

/** Adds one to the day's and the month's counter ("2026-11-07" -> month "2026-11"). */
export async function countEvent(day: string, name: string, detail: string): Promise<void> {
  const month = day.slice(0, 7);
  const db = await getDb();
  if (!db) return;
  ready ??= db
    .batch([db.prepare(SCHEMA), db.prepare(DAY_SCHEMA)])
    .catch((err) => {
      ready = null;
      throw err;
    });
  await ready;
  await db.batch([
    db
      .prepare(
        `INSERT INTO event_month (month, name, detail, n) VALUES (?1, ?2, ?3, 1)
       ON CONFLICT (month, name, detail) DO UPDATE SET n = n + 1`
      )
      .bind(month, name, detail),
    db
      .prepare(
        `INSERT INTO event_day (day, name, detail, n) VALUES (?1, ?2, ?3, 1)
       ON CONFLICT (day, name, detail) DO UPDATE SET n = n + 1`
      )
      .bind(day, name, detail),
  ]);
}

export interface DayEvents {
  day: string;
  /** Count per action name, details summed. */
  counts: Record<string, number>;
}

/** The last `days` days with any counted action, newest first; [] without the table or database. */
export async function recentDayEvents(days = 14): Promise<DayEvents[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const { results } = await db
      .prepare(`SELECT day, name, SUM(n) AS n FROM event_day WHERE day >= ?1 GROUP BY day, name ORDER BY day DESC`)
      .bind(since)
      .all<{ day: string; name: string; n: number }>();
    const byDay = new Map<string, DayEvents>();
    for (const r of results) {
      const d = byDay.get(r.day) ?? { day: r.day, counts: {} };
      d.counts[r.name] = r.n;
      byDay.set(r.day, d);
    }
    return [...byDay.values()];
  } catch {
    return []; // Table not created yet.
  }
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
  /** Planned trips with a recorded time since landing, and those within two minutes (plan_took). */
  plannedTimed: number;
  plannedFast: number;
  /** Actions counted since this was added; list_empty = a home list came back empty. */
  gpx: number;
  onTrail: number;
  listEmpty: number;
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
      { month: r.month, starts: 0, saved: 0, sent: 0, sentFast: 0, friendOpens: 0, navigations: 0, plusWant: 0, plusNo: 0, planned: 0, plannedTimed: 0, plannedFast: 0, gpx: 0, onTrail: 0, listEmpty: 0, heardFrom: {} };
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
    else if (r.name === "plan_took") {
      m.plannedTimed += r.n;
      if (r.detail === "0-2 min") m.plannedFast += r.n;
    } else if (r.name === "gpx_download") m.gpx += r.n;
    else if (r.name === "on_trail") m.onTrail += r.n;
    else if (r.name === "list_empty") m.listEmpty += r.n;
    else if (r.name === "heard_from") m.heardFrom[r.detail] = (m.heardFrom[r.detail] ?? 0) + r.n;
  }
  return [...months.values()];
}
