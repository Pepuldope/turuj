// POST /api/sync: the guards in front of syncAccount, and one good call.
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "@/lib/d1";

interface DatabaseSync {
  prepare(sql: string): { run(...v: unknown[]): unknown; get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };

let db: D1Like | null = null;
vi.mock("@/lib/d1", () => ({ getDb: async () => db }));
const auth = await import("@/lib/auth");
const route = await import("@/app/api/sync/route");
const { MAX_REQUEST } = await import("@/lib/syncMerge");

function d1(sqlite: DatabaseSync): D1Like {
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...v) => statement(sql, v),
    run: async () => sqlite.prepare(sql).run(...values),
    first: async <T,>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  });
  return { prepare: (sql) => statement(sql), batch: async (s) => { for (const x of s) await x.run(); } };
}
db = d1(new DatabaseSync(":memory:"));

const call = (body: string, { url = "https://turuj.sk/api/sync", token }: { url?: string; token?: string } = {}) =>
  route.POST(new Request(url, { method: "POST", body, headers: token ? { cookie: `${auth.SESSION_COOKIE}=${token}` } : {} }));

describe("POST /api/sync", () => {
  it("refuses a preview host", async () => {
    const res = await call("{}", { url: "https://x-turuj.someone.workers.dev/api/sync" });
    expect(res.status).toBe(403);
  });

  it("needs a signed-in account", async () => {
    const res = await call("{}");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "signedout" });
  });

  it("refuses a request that is too big or not an object", async () => {
    const a = await auth.accountFor("sync@x.sk");
    const token = await auth.startSession(a.id, "email");
    const big = await call(JSON.stringify({ pad: "x".repeat(MAX_REQUEST) }), { token });
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ ok: false, error: "big" });
    for (const body of ["not json", "[]", "null", "5"]) {
      const res = await call(body, { token });
      expect(res.status, body).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "bad" });
    }
  });

  it("answers a good call, never cached", async () => {
    const a = await auth.accountFor("sync2@x.sk");
    const token = await auth.startSession(a.id, "email");
    const res = await call(JSON.stringify({ plans: [{ key: "rysy", at: 5, body: { slug: "rysy", name: "Rysy" } }] }), { token });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, more: false, plans: { send: [], want: [], at: {} }, visits: { send: [], want: [], at: {} } });
    const again = await (await call("{}", { token })).json();
    expect(again.plans.send).toHaveLength(1);
  });
});
