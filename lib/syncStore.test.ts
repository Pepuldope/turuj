// Account sync on the server, against an in-memory SQLite in D1's shape (as lib/auth.test.ts).
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "@/lib/d1";
import type { WireItem } from "@/lib/syncMerge";

interface DatabaseSync {
  prepare(sql: string): { run(...v: unknown[]): unknown; get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };

let db: D1Like | null = null;
vi.mock("@/lib/d1", () => ({ getDb: async () => db }));
const auth = await import("@/lib/auth");
const store = await import("@/lib/syncStore");
const { SEND_BUDGET } = await import("@/lib/syncMerge");

function d1(sqlite: DatabaseSync): D1Like {
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...v) => statement(sql, v),
    run: async () => sqlite.prepare(sql).run(...values),
    first: async <T,>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  });
  return { prepare: (sql) => statement(sql), batch: async (s) => { for (const x of s) await x.run(); } };
}

// One database for the file: the tables are made once per process, as on the Worker. Each test uses its own account.
const sqlite = new DatabaseSync(":memory:");
db = d1(sqlite);
const rows = (account: string) => sqlite.prepare(`SELECT kind, key, at, gone, body FROM account_item WHERE account = ? ORDER BY kind, key`).all(account) as { kind: string; key: string; at: number; gone: number; body: string | null }[];

const NOW = 1_800_000_000_000;
const plan = (slug: string, at: number, extra: Record<string, unknown> = {}): WireItem => ({ key: slug, at, body: { slug, name: slug, date: "2026-08-01", ...extra } });
const gone = (key: string, at: number): WireItem => ({ key, at, gone: true });
const visit = (key: string, at: number): WireItem => ({ key, at, body: { slug: "rysy", name: "Rysy", date: "", from: "manual" } });

let acc = "";
let n = 0;
beforeEach(() => {
  acc = `store-${++n}`;
});

describe("syncAccount storing", () => {
  it("stores new items and says nothing to send back", async () => {
    const a = await store.syncAccount(acc, { plans: [plan("a", 100)], visits: [visit("m:1", 100)] }, NOW);
    expect(a).toMatchObject({ ok: true, now: NOW, more: false, plans: { send: [], want: [], at: {} }, visits: { send: [], want: [], at: {} } });
    expect(rows(acc).map((r) => `${r.kind}:${r.key}`)).toEqual(["plan:a", "visit:m:1"]);
  });

  it("writes only when newer", async () => {
    await store.syncAccount(acc, { plans: [plan("a", 200, { date: "2026-09-09" })] }, NOW);
    const older = await store.syncAccount(acc, { plans: [plan("a", 100, { date: "2026-01-01" })] }, NOW);
    expect(older.plans.send).toEqual([plan("a", 200, { date: "2026-09-09" })]);
    expect(JSON.parse(rows(acc)[0].body ?? "{}").date).toBe("2026-09-09");
    await store.syncAccount(acc, { plans: [plan("a", 300, { date: "2026-12-12" })] }, NOW);
    expect(JSON.parse(rows(acc)[0].body ?? "{}").date).toBe("2026-12-12");
  });

  it("keeps a tombstone with no body and sends it as one", async () => {
    await store.syncAccount(acc, { plans: [plan("a", 100)] }, NOW);
    await store.syncAccount(acc, { plans: [gone("a", 200)] }, NOW);
    expect(rows(acc)[0]).toMatchObject({ gone: 1, at: 200, body: null });
    const other = await store.syncAccount(acc, { plans: [plan("a", 150)] }, NOW);
    expect(other.plans.send).toEqual([gone("a", 200)]);
    // A device that never had the item gets no tombstone.
    expect((await store.syncAccount(acc, { plans: [] }, NOW)).plans.send).toEqual([]);
  });

  it("skips invalid items without failing the rest", async () => {
    await store.syncAccount(acc, { plans: [{ key: "Bad Key", at: 1, gone: true }, plan("ok", 5), plan("x", 5, { slug: "other" })] as WireItem[] }, NOW);
    expect(rows(acc).map((r) => r.key)).toEqual(["ok"]);
  });

  it("strips device-only fields from what it keeps", async () => {
    await store.syncAccount(acc, { plans: [plan("a", 5, { offline: "ok", eve: true, weather: {} })] }, NOW);
    expect(Object.keys(JSON.parse(rows(acc)[0].body ?? "{}")).sort()).toEqual(["date", "name", "slug"]);
  });

  it("asks for the body of a newer body-less item", async () => {
    const a = await store.syncAccount(acc, { plans: [{ key: "a", at: 5 }] }, NOW);
    expect(a.plans.want).toEqual(["a"]);
    expect(rows(acc)).toEqual([]);
  });

  it("tells back an at it clamped", async () => {
    const a = await store.syncAccount(acc, { plans: [plan("a", NOW + 1e9)] }, NOW);
    expect(a.plans.at).toEqual({ a: NOW });
    expect(rows(acc)[0].at).toBe(NOW);
  });

  it("answers a partial request without the unlisted items", async () => {
    await store.syncAccount(acc, { plans: [plan("a", 5), plan("b", 5)] }, NOW);
    expect((await store.syncAccount(acc, { partial: true, plans: [] }, NOW)).plans.send).toEqual([]);
    expect((await store.syncAccount(acc, { plans: [] }, NOW)).plans.send.map((i) => i.key)).toEqual(["a", "b"]);
  });
});

describe("the most items an account may hold", () => {
  const small = { plan: 3, visit: 3 };
  it("refuses new keys when full but still updates and deletes existing ones", async () => {
    await store.syncAccount(acc, { plans: [plan("a", 1), plan("b", 1), gone("c", 1)] }, NOW, small);
    const a = await store.syncAccount(acc, { plans: [plan("d", 5), plan("a", 9, { date: "2030-01-01" }), gone("b", 9)] }, NOW, small);
    expect(rows(acc).map((r) => r.key)).toEqual(["a", "b", "c"]);
    expect(JSON.parse(rows(acc)[0].body ?? "{}").date).toBe("2030-01-01");
    expect(rows(acc)[1].gone).toBe(1);
    expect(a.plans.at).toEqual({});
  });
  it("ignores the items of a list past the maximum", async () => {
    await store.syncAccount(acc, { plans: ["a", "b", "c", "d", "e"].map((k) => plan(k, 1)) }, NOW, small);
    expect(rows(acc).map((r) => r.key)).toEqual(["a", "b", "c"]);
  });
});

describe("the size of one answer", () => {
  it("stops adding bodies past the budget and says there is more", async () => {
    const pad = "x".repeat(300_000 - 200);
    const items = ["a", "b", "c", "d", "e"].map((k, i) => plan(k, 10 + i, { pad }));
    await store.syncAccount(acc, { plans: items }, NOW);
    const first = await store.syncAccount(acc, { plans: [] }, NOW);
    expect(first.more).toBe(true);
    const size = first.plans.send.reduce((t, i) => t + JSON.stringify(i.body).length, 0);
    expect(size).toBeGreaterThan(SEND_BUDGET);
    expect(first.plans.send.length).toBeLessThan(5);
    const rest = await store.syncAccount(acc, { plans: first.plans.send }, NOW);
    expect(rest.more).toBe(false);
    expect(rest.plans.send.length + first.plans.send.length).toBe(5);
  });
  it("sends plans before visits", async () => {
    await store.syncAccount(acc, { plans: [plan("a", 1)], visits: [visit("m:1", 1)] }, NOW);
    const a = await store.syncAccount(acc, {}, NOW);
    expect(a.plans.send.map((i) => i.key)).toEqual(["a"]);
    expect(a.visits.send.map((i) => i.key)).toEqual(["m:1"]);
  });
});

describe("deleting an account and totals", () => {
  it("deleteAccount removes the items of that account only", async () => {
    const mine = await auth.accountFor(`mine-${n}@x.sk`);
    const other = await auth.accountFor(`other-${n}@x.sk`);
    await store.syncAccount(mine.id, { plans: [plan("a", 1)], visits: [visit("m:1", 1)] }, NOW);
    await store.syncAccount(other.id, { plans: [plan("a", 1)] }, NOW);
    await auth.deleteAccount(mine);
    expect(rows(mine.id)).toEqual([]);
    expect(rows(other.id)).toHaveLength(1);
  });

  it("counts live plans, visits and accounts, without naming anyone", async () => {
    const before = (await store.syncTotals())!;
    await store.syncAccount(acc, { plans: [plan("a", 1), plan("b", 1), gone("c", 1)], visits: [visit("m:1", 1)] }, NOW);
    await store.syncAccount(`${acc}-empty`, { plans: [gone("z", 1)] }, NOW);
    const after = (await store.syncTotals())!;
    expect(after).toEqual({ accounts: before.accounts + 1, plans: before.plans + 2, visits: before.visits + 1 });
  });

  it("totals are null without a database", async () => {
    const keep = db;
    db = null;
    expect(await store.syncTotals()).toBeNull();
    await expect(store.syncAccount(acc, {}, NOW)).rejects.toThrow("no database");
    db = keep;
  });
});
