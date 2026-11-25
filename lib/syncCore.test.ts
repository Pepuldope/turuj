// Device-side sync logic: requests, applying answers, and whole exchanges against the real store.
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "@/lib/d1";
import type { DeviceState } from "@/lib/syncCore";
import type { SyncAnswer, SyncRequest, WireItem } from "@/lib/syncMerge";

interface DatabaseSync {
  prepare(sql: string): { run(...v: unknown[]): unknown; get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };

let db: D1Like | null = null;
let inserts = 0;
vi.mock("@/lib/d1", () => ({ getDb: async () => db }));
const core = await import("@/lib/syncCore");
const store = await import("@/lib/syncStore");

function d1(sqlite: DatabaseSync): D1Like {
  const statement = (sql: string, values: unknown[] = []): D1Statement => {
    const count = () => {
      if (/^\s*INSERT INTO account_item/.test(sql)) inserts++;
    };
    return {
      bind: (...v) => statement(sql, v),
      run: async () => (count(), sqlite.prepare(sql).run(...values)),
      first: async <T,>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
      all: async <T,>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
    };
  };
  return { prepare: (sql) => statement(sql), batch: async (s) => { for (const x of s) await x.run(); } };
}

// One database for the file: the tables are made once per process, as on the Worker. Each test uses its own account.
db = d1(new DatabaseSync(":memory:"));

const NOW = 1_800_000_000_000;
const plan = (slug: string, at: number, extra: Record<string, unknown> = {}): WireItem => ({ key: slug, at, body: { slug, name: slug, date: "2026-08-01", ...extra } });
const gone = (key: string, at: number): WireItem => ({ key, at, gone: true });
const visit = (key: string, at: number): WireItem => ({ key, at, body: { slug: "rysy", name: "Rysy", date: "2026-08-01", from: "manual" } });
const device = (plans: WireItem[] = [], visits: WireItem[] = []): DeviceState => ({ plans, visits, synced: { plans: {}, visits: {} } });
const keys = (items: WireItem[]) => items.map((i) => i.key).sort();
const find = (items: WireItem[], key: string) => items.find((i) => i.key === key);

function post(account: string, now: () => number, bodies?: { sent: number[] }) {
  return async (r: SyncRequest): Promise<SyncAnswer> => {
    // Every request goes through JSON, as over the network.
    const wire = JSON.parse(JSON.stringify(r)) as SyncRequest;
    bodies?.sent.push([...(wire.plans ?? []), ...(wire.visits ?? [])].reduce((n, i) => n + (i.body === undefined ? 0 : JSON.stringify(i.body).length), 0));
    return JSON.parse(JSON.stringify(await store.syncAccount(account, wire, now())));
  };
}

describe("buildRequest", () => {
  it("sends bodies only for live items changed since the server had them", () => {
    const s = device([plan("a", 5), plan("b", 6), gone("c", 7)]);
    s.synced.plans = { b: 6 };
    const req = core.buildRequest(s);
    expect(req.partial).toBeUndefined();
    expect(req.plans).toEqual([plan("a", 5), { key: "b", at: 6 }, gone("c", 7)]);
  });
  it("keeps to the budget but always lets one body through", () => {
    const s = device([plan("a", 1, { pad: "x".repeat(300) }), plan("b", 2, { pad: "x".repeat(300) })]);
    expect(core.buildRequest(s, 1000).plans?.map((i) => i.body !== undefined)).toEqual([true, true]);
    expect(core.buildRequest(s, 500).plans?.map((i) => i.body !== undefined)).toEqual([true, false]);
    expect(core.buildRequest(s, 10).plans?.map((i) => i.body !== undefined)).toEqual([true, false]);
  });
});

describe("buildFollowUp", () => {
  const answer = (over: Partial<SyncAnswer> = {}): SyncAnswer => ({ ok: true, now: NOW, more: false, plans: { send: [], want: [], at: {} }, visits: { send: [], want: [], at: {} }, ...over });
  it("sends the wanted bodies, partial", () => {
    const s = device([plan("a", 1), plan("b", 2)], [visit("m:1", 3)]);
    const a = answer({ plans: { send: [], want: ["b"], at: {} }, visits: { send: [], want: ["m:1"], at: {} } });
    expect(core.buildFollowUp(s, a)).toEqual({ partial: true, plans: [plan("b", 2)], visits: [visit("m:1", 3)] });
  });
  it("asks for everything again when only more is set", () => {
    const s = device([plan("a", 1)]);
    expect(core.buildFollowUp(s, answer({ more: true }))).toEqual(core.buildRequest(s));
  });
  it("is done otherwise", () => {
    expect(core.buildFollowUp(device(), answer())).toBeNull();
  });
});

describe("applyAnswer", () => {
  it("does not touch the old state", () => {
    const s = device([plan("a", 1)]);
    const copy = JSON.stringify(s);
    core.applyAnswer(s, core.buildRequest(s), { ok: true, now: NOW, more: false, plans: { send: [plan("z", 9)], want: [], at: { a: 2 } }, visits: { send: [], want: [], at: {} } });
    expect(JSON.stringify(s)).toBe(copy);
  });
  it("drops an acknowledged tombstone and one received from the server", () => {
    const s = device([gone("a", 5), plan("b", 1)]);
    const next = core.applyAnswer(s, core.buildRequest(s), { ok: true, now: NOW, more: false, plans: { send: [gone("b", 9)], want: [], at: {} }, visits: { send: [], want: [], at: {} } });
    expect(next.plans).toEqual([]);
    expect(next.synced.plans).toEqual({});
  });
  it("keeps a newer local copy when the server sends an older one", () => {
    // The server refused this device's newer version (say, too big) and still holds the old one.
    const s = device([plan("a", 9, { date: "2026-09-09" }), plan("b", 9)]);
    const next = core.applyAnswer(s, core.buildRequest(s), { ok: true, now: NOW, more: false, plans: { send: [plan("a", 5), gone("b", 5)], want: [], at: {} }, visits: { send: [], want: [], at: {} } });
    expect(find(next.plans, "a")).toEqual(plan("a", 9, { date: "2026-09-09" }));
    expect(find(next.plans, "b")).toEqual(plan("b", 9));
  });
});

describe("two devices through the real store", () => {
  let ACC = "";
  let n = 0;
  let clock = NOW;
  const tick = () => (clock += 1000);
  beforeEach(() => {
    clock = NOW;
    ACC = `acc-${++n}`;
  });

  it("(a) merges different trips", async () => {
    const phone0 = device([plan("a", 100), plan("b", 101)]);
    const laptop0 = device([plan("c", 102)]);
    const p = post(ACC, tick);
    const phone1 = await core.runSync(phone0, p);
    const laptop1 = await core.runSync(laptop0, p);
    const phone2 = await core.runSync(phone1, p);
    expect(keys(phone2.plans)).toEqual(["a", "b", "c"]);
    expect(keys(laptop1.plans)).toEqual(["a", "b", "c"]);
  });

  it("(b) the later of two saves of one trail wins on both", async () => {
    const p = post(ACC, tick);
    const phone = await core.runSync(device([plan("a", 100, { date: "2026-08-01" })]), p);
    const laptop = await core.runSync(device([plan("a", 200, { date: "2026-09-09" })]), p);
    const phone2 = await core.runSync(phone, p);
    expect((find(laptop.plans, "a")?.body as { date: string }).date).toBe("2026-09-09");
    expect((find(phone2.plans, "a")?.body as { date: string }).date).toBe("2026-09-09");
  });

  it("(c) a deletion reaches the others and an old copy does not bring the trip back", async () => {
    const p = post(ACC, tick);
    const phone0 = await core.runSync(device([plan("a", 100), plan("b", 100)]), p);
    const laptop0 = await core.runSync(device(), p);
    const third = await core.runSync(device([plan("a", 100)]), p);
    expect(keys(laptop0.plans)).toEqual(["a", "b"]);
    // The phone deletes a.
    const phoneDel: DeviceState = { ...phone0, plans: phone0.plans.map((i) => (i.key === "a" ? gone("a", 500) : i)) };
    const phone1 = await core.runSync(phoneDel, p);
    expect(keys(phone1.plans)).toEqual(["b"]);
    const laptop1 = await core.runSync(laptop0, p);
    expect(keys(laptop1.plans)).toEqual(["b"]);
    // A third device that still has the old a.
    const stale = device([plan("a", 100)]);
    const third1 = await core.runSync(stale, p);
    expect(keys(third1.plans)).toEqual(["b"]);
    expect(third.plans.length).toBeGreaterThan(0);
    // And the old a never came back for anyone.
    expect(keys((await core.runSync(phone1, p)).plans)).toEqual(["b"]);
  });

  it("(d) saved again after deleting, it lives again everywhere", async () => {
    const p = post(ACC, tick);
    const phone0 = await core.runSync(device([plan("a", 100)]), p);
    const laptop0 = await core.runSync(device(), p);
    const phone1 = await core.runSync({ ...phone0, plans: [gone("a", 200)] }, p);
    const laptop1 = await core.runSync(laptop0, p);
    expect(laptop1.plans).toEqual([]);
    const phone2 = await core.runSync({ ...phone1, plans: [plan("a", 300, { date: "2027-01-01" })] }, p);
    const laptop2 = await core.runSync(laptop1, p);
    expect((find(laptop2.plans, "a")?.body as { date: string }).date).toBe("2027-01-01");
    expect(phone2.plans).toHaveLength(1);
  });

  it("(e) a clock one year ahead is clamped, corrected locally, and a real edit still wins", async () => {
    const p = post(ACC, () => NOW);
    const year = 365 * 86400_000;
    const wrong = await core.runSync(device([plan("a", NOW + year, { date: "2026-01-01" })]), p);
    expect(find(wrong.plans, "a")?.at).toBe(NOW);
    expect(wrong.synced.plans.a).toBe(NOW);
    const other = await core.runSync(device(), p);
    expect(find(other.plans, "a")?.at).toBe(NOW);
    // The other device edits a moment later (its clock is right).
    const edited = await core.runSync({ ...other, plans: [plan("a", NOW + 5, { date: "2026-02-02" })] }, post(ACC, () => NOW + 10));
    const back = await core.runSync(wrong, post(ACC, () => NOW + 10));
    expect((find(back.plans, "a")?.body as { date: string }).date).toBe("2026-02-02");
    expect(edited.plans).toHaveLength(1);
  });

  it("(f) visits of one trail each survive, and a deleted one is gone on the other device", async () => {
    const p = post(ACC, tick);
    const phone0 = await core.runSync(device([], [visit("m:1", 100), visit("m:2", 101)]), p);
    const laptop0 = await core.runSync(device(), p);
    expect(keys(laptop0.visits)).toEqual(["m:1", "m:2"]);
    const phone1 = await core.runSync({ ...phone0, visits: [gone("m:1", 300), phone0.visits[1]] }, p);
    expect(keys(phone1.visits)).toEqual(["m:2"]);
    const laptop1 = await core.runSync(laptop0, p);
    expect(keys(laptop1.visits)).toEqual(["m:2"]);
  });

  it("(g) many large plans move in several rounds within the request budget", async () => {
    const big = (n: number) => plan(`trip-${n}`, 100 + n, { pad: "x".repeat(200_000) });
    const phone0 = device(Array.from({ length: 8 }, (_, i) => big(i)));
    const sent = { sent: [] as number[] };
    const p = post(ACC, tick, sent);
    await core.runSync(phone0, p);
    expect(sent.sent.length).toBeGreaterThan(1);
    // One body may pass the budget, a second may not.
    for (const n of sent.sent) expect(n).toBeLessThanOrEqual(400_000 + 200_100);
    const laptop = await core.runSync(device(), post(ACC, tick, sent), 20);
    expect(keys(laptop.plans)).toHaveLength(8);
    expect((find(laptop.plans, "trip-3")?.body as { pad: string }).pad).toHaveLength(200_000);
  });

  it("(h) another account sees nothing of it", async () => {
    await core.runSync(device([plan("a", 100)], [visit("m:1", 100)]), post(`${ACC}-A`, tick));
    const b = await core.runSync(device(), post(`${ACC}-B`, tick));
    expect(b.plans).toEqual([]);
    expect(b.visits).toEqual([]);
  });

  it("(i) a second run with nothing changed moves no bodies and writes nothing", async () => {
    const bodies = { sent: [] as number[] };
    const p = post(ACC, tick, bodies);
    const phone = await core.runSync(device([plan("a", 100)], [visit("m:1", 100)]), p);
    const laptop = await core.runSync(device(), p);
    inserts = 0;
    bodies.sent = [];
    const phone2 = await core.runSync(phone, p);
    const laptop2 = await core.runSync(laptop, p);
    expect(inserts).toBe(0);
    expect(bodies.sent.every((n) => n === 0)).toBe(true);
    const answer = await store.syncAccount(ACC, core.buildRequest(phone2), tick());
    expect(answer.plans.send).toEqual([]);
    expect(answer.visits.send).toEqual([]);
    expect(phone2).toEqual(phone);
    expect(laptop2).toEqual(laptop);
  });
});
