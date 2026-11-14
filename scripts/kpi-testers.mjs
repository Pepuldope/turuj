// Testers' days for the school goal: per calendar month, how many signed-in testers there are and how
// many used Túruj on at least 4 different days ("aktívni používatelia"), plus each tester's day count.
// Read-only: two SELECTs against the live D1 through wrangler (needs `npx wrangler login` or
// CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID). Usage: npm run kpi:testers [-- --db mountour-visits]
import { execFileSync } from "node:child_process";

const dbArg = process.argv.indexOf("--db");
const DB = dbArg > 0 ? process.argv[dbArg + 1] : "mountour-visits";
const ACTIVE_DAYS = 4;

function select(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out)[0]?.results ?? [];
}

/** "peter@gmail.com" -> "pe***@gmail.com"; anything without an @ -> first two characters + "***". */
export function maskEmail(email) {
  const at = email.indexOf("@");
  if (at < 0) return `${email.slice(0, 2)}***`;
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

/** rows: { account, email, day } -> per month: testers, active ones, and each tester's days. */
export function summarize(rows, activeDays = ACTIVE_DAYS) {
  const months = new Map();
  for (const r of rows) {
    const month = r.day.slice(0, 7);
    const m = months.get(month) ?? new Map();
    m.set(r.account, { email: r.email, days: (m.get(r.account)?.days ?? 0) + 1 });
    months.set(month, m);
  }
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, people]) => {
      const list = [...people.values()].sort((a, b) => b.days - a.days);
      return { month, testers: list.length, active: list.filter((p) => p.days >= activeDays).length, people: list };
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = select("SELECT COUNT(*) AS n FROM tester")[0]?.n ?? 0;
  const rows = select("SELECT d.account AS account, COALESCE(a.email, '') AS email, d.day AS day FROM tester_day d LEFT JOIN account a ON a.id = d.account ORDER BY d.day");
  console.log(`Testers signed up (signed in when they pressed "Chcem testovať"): ${all}`);
  for (const m of summarize(rows)) {
    console.log(`\n${m.month}: ${m.testers} testers used the app, ${m.active} active (>= ${ACTIVE_DAYS} different days)`);
    for (const p of m.people) console.log(`  ${maskEmail(p.email).padEnd(32)} ${String(p.days).padStart(2)} days${p.days >= ACTIVE_DAYS ? "  *" : ""}`);
  }
  if (!rows.length) console.log("\nNo tester days recorded yet.");
}
