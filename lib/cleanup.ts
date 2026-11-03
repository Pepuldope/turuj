import type { D1Like } from "@/lib/d1";

// Hourly clean-up on the cron (worker.ts), so the database keeps only what /sukromie says it keeps:
// email codes that stopped working, sessions past their end, and messages from "Napíšte nám" /
// "Nahlásiť chybu" a year after they came. A table that doesn't exist yet is fine.

export const FEEDBACK_KEEP_DAYS = 365;

export function cleanupStatements(now = Date.now()): string[] {
  const feedbackBefore = new Date(now - FEEDBACK_KEEP_DAYS * 86400_000).toISOString();
  return [
    `DELETE FROM login_code WHERE expires < ${now}`,
    `DELETE FROM account_session WHERE expires < ${now}`,
    `DELETE FROM feedback WHERE at < '${feedbackBefore}'`,
  ];
}

export async function cleanup(db: D1Like, now = Date.now()): Promise<number> {
  let n = 0;
  for (const sql of cleanupStatements(now)) {
    try {
      const r = (await db.prepare(sql).run()) as { meta?: { changes?: number } };
      n += r?.meta?.changes ?? 0;
    } catch {
      // "no such table": nothing of that kind stored yet.
    }
  }
  return n;
}
