// Tester join + day recording (lib/auth.ts, app/api/tester/join, app/api/auth/me) against an in-memory SQLite in D1's shape.
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "@/lib/d1";

interface DatabaseSync {
  prepare(sql: string): { run(...v: unknown[]): unknown; get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };

const sqlite = new DatabaseSync(":memory:");
function d1(): D1Like {
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...v) => statement(sql, v),
    run: async () => sqlite.prepare(sql).run(...values),
    first: async <T,>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  });
  return { prepare: (sql) => statement(sql), batch: async (s) => { for (const x of s) await x.run(); } };
}
vi.mock("@/lib/d1", () => ({ getDb: async () => db }));
const db = d1();

const auth = await import("@/lib/auth");
const { POST: join } = await import("@/app/api/tester/join/route");
const { GET: me } = await import("@/app/api/auth/me/route");

const days = (account: string) => (sqlite.prepare(`SELECT day FROM tester_day WHERE account = ? ORDER BY day`).all(account) as { day: string }[]).map((r) => r.day);
const testers = () => sqlite.prepare(`SELECT account, since FROM tester`).all() as { account: string; since: string }[];

async function signedIn(email: string) {
  const account = await auth.accountFor(email);
  const token = await auth.startSession(account.id, "password");
  return { account, cookie: `${auth.SESSION_COOKIE}=${token}` };
}
const post = (url: string, cookie?: string) => new Request(url, { method: "POST", headers: cookie ? { cookie } : {} });

describe("POST /api/tester/join", () => {
  it("refuses on a preview and writes nothing", async () => {
    const { account, cookie } = await signedIn("prev@b.sk");
    const res = await join(post("https://turuj-pr-1.x.workers.dev/api/tester/join", cookie));
    expect(res.status).toBe(403);
    expect(testers().some((t) => t.account === account.id)).toBe(false);
  });

  it("refuses a signed-out visitor", async () => {
    const before = testers().length;
    const res = await join(post("https://turuj.sk/api/tester/join"));
    expect(res.status).toBe(401);
    expect(testers()).toHaveLength(before);
  });

  it("marks the account once and keeps the first date", async () => {
    const { account, cookie } = await signedIn("join@b.sk");
    expect((await join(post("https://turuj.sk/api/tester/join", cookie))).status).toBe(200);
    sqlite.prepare(`UPDATE tester SET since = '2026-11-01' WHERE account = ?`).run(account.id);
    expect((await join(post("https://turuj.sk/api/tester/join", cookie))).status).toBe(200);
    expect(testers().filter((t) => t.account === account.id)).toEqual([{ account: account.id, since: "2026-11-01" }]);
    expect(days(account.id)).toHaveLength(1);
  });
});

describe("recording days", () => {
  const meReq = (cookie?: string, host = "turuj.sk") => new Request(`https://${host}/api/auth/me`, { headers: cookie ? { cookie } : {} });

  it("uses the Bratislava date", () => {
    expect(auth.bratislavaDay(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-15");
    expect(auth.bratislavaDay(new Date("2026-11-14T10:00:00Z"))).toBe("2026-11-14");
  });

  it("notes one day per tester no matter how many page loads", async () => {
    const { account, cookie } = await signedIn("day@b.sk");
    await join(post("https://turuj.sk/api/tester/join", cookie));
    sqlite.prepare(`DELETE FROM tester_day WHERE account = ?`).run(account.id);
    for (let i = 0; i < 3; i++) await me(meReq(cookie));
    expect(days(account.id)).toEqual([auth.bratislavaDay()]);
    await auth.recordTesterDay(account.id, new Date(Date.now() + 2 * 86400_000));
    expect(days(account.id)).toHaveLength(2);
  });

  it("records nothing for an account that is not a tester", async () => {
    const { account, cookie } = await signedIn("plain@b.sk");
    expect((await me(meReq(cookie))).status).toBe(200);
    expect(days(account.id)).toEqual([]);
  });

  it("records nothing on a preview", async () => {
    const { account, cookie } = await signedIn("pv2@b.sk");
    await join(post("https://turuj.sk/api/tester/join", cookie));
    sqlite.prepare(`DELETE FROM tester_day WHERE account = ?`).run(account.id);
    await me(meReq(cookie, "turuj-pr-1.x.workers.dev"));
    expect(days(account.id)).toEqual([]);
  });

  it("is deleted with the account", async () => {
    const { account, cookie } = await signedIn("gone@b.sk");
    await join(post("https://turuj.sk/api/tester/join", cookie));
    await auth.deleteAccount(account);
    expect(days(account.id)).toEqual([]);
    expect(testers().some((t) => t.account === account.id)).toBe(false);
  });
});
