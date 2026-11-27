import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "@/lib/d1";
import type { DeviceLists } from "@/lib/accountSyncState";
import { fromDevice, toDevice } from "@/lib/accountSyncState";
import type { SavedTrip } from "@/lib/savedTrips";
import { runSync } from "@/lib/syncCore";
import type { DeviceState } from "@/lib/syncCore";
import type { SyncAnswer, SyncRequest } from "@/lib/syncMerge";
import type { Visit } from "@/lib/visits";

interface DatabaseSync {
  prepare(sql: string): { run(...v: unknown[]): unknown; get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };

let db: D1Like | null = null;
vi.mock("@/lib/d1", () => ({ getDb: async () => db }));
const store = await import("@/lib/syncStore");

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

const trip = (slug: string, extra: Partial<SavedTrip> = {}): SavedTrip => ({
  slug,
  name: slug.toUpperCase(),
  date: "2026-08-01",
  time: "08:00",
  start: null,
  driveMin: null,
  hikeMin: 300,
  sun: { lat: 49.1, lon: 20.1 },
  savedAt: "2026-07-01T10:00:00.000Z",
  changedAt: 1_700_000_000_000,
  offline: "ok",
  ...extra,
});
const lists = (extra: Partial<DeviceLists> = {}): DeviceLists => ({ trips: [], savedGone: {}, visits: [], visitsGone: {}, ...extra });
const noSynced = (): DeviceState["synced"] => ({ plans: {}, visits: {} });
const visit = (id: string, at: number): Visit => ({ id, slug: "a", route: "a", name: "A", date: "2026-08-01", from: "plan", at });

describe("toDevice", () => {
  it("strips device fields and changedAt, and the newer of a live item and its tombstone wins", () => {
    const state = toDevice(lists({ trips: [trip("a", { eve: true, offline: "ok", changedAt: 500 }), trip("b", { changedAt: 100 })], savedGone: { b: 200, c: 300 } }), noSynced());
    const a = state.plans.find((p) => p.key === "a");
    expect(a?.at).toBe(500);
    expect(a?.body).not.toHaveProperty("offline");
    expect(a?.body).not.toHaveProperty("eve");
    expect(a?.body).not.toHaveProperty("changedAt");
    expect(state.plans.find((p) => p.key === "b")).toEqual({ key: "b", at: 200, gone: true });
    expect(state.plans.find((p) => p.key === "c")).toEqual({ key: "c", at: 300, gone: true });
  });
  it("sends the start place rounded to about 100 m and keeps the exact one on the device", () => {
    const mine = trip("a", { start: { lat: 48.148598, lon: 17.107748, label: "Bratislava" } });
    const state = toDevice(lists({ trips: [mine] }), noSynced());
    expect((state.plans[0].body as SavedTrip).start).toEqual({ lat: 48.149, lon: 17.108, label: "Bratislava" });
    expect(mine.start?.lat).toBe(48.148598);
  });
  it("sends how with a visit, and no key when there is none", () => {
    const how = { travel: "car" as const, withKids: true };
    const state = toDevice(lists({ visits: [{ ...visit("p:a:2026-08-01", 7), how }, visit("p:b:2026-08-01", 8)] }), noSynced());
    expect(state.visits[0].body).toMatchObject({ how });
    expect(state.visits[1].body).not.toHaveProperty("how");
  });
  it("maps visits", () => {
    const state = toDevice(lists({ visits: [visit("p:a:2026-08-01", 7)] }), noSynced());
    expect(state.visits).toEqual([{ key: "p:a:2026-08-01", at: 7, body: { slug: "a", route: "a", name: "A", date: "2026-08-01", from: "plan" } }]);
  });
});

/** An exchange where the server answered with exactly `result`, as if the lists did not change meanwhile. */
const body = (t: SavedTrip) => toDevice(lists({ trips: [t] }), noSynced()).plans[0];

describe("how on a visit across the wire", () => {
  const how = { start: { lat: 48.149, lon: 17.108, label: "Bratislava" }, travel: "transit" as const, stops: [{ id: "a:poi:1", name: "Chata", min: 30 }] };
  const empty = toDevice(lists(), noSynced());
  const arrive = (body: unknown) => {
    const result: DeviceState = { ...empty, visits: [{ key: "p:a:2026-08-01", at: 7, body }], synced: { plans: {}, visits: { "p:a:2026-08-01": 7 } } };
    return fromDevice(result, empty, lists()).lists.visits;
  };
  it("survives toDevice and fromDevice", () => {
    const sent = toDevice(lists({ visits: [{ ...visit("p:a:2026-08-01", 7), how }] }), noSynced()).visits[0];
    expect(arrive(JSON.parse(JSON.stringify(sent.body)))).toEqual([{ ...visit("p:a:2026-08-01", 7), how }]);
  });
  it("a malformed how is ignored and the visit still arrives", () => {
    const out = arrive({ slug: "a", route: "a", name: "A", date: "2026-08-01", from: "plan", how: { travel: "bike" } });
    expect(out).toEqual([visit("p:a:2026-08-01", 7)]);
  });
});

describe("fromDevice", () => {
  const empty = toDevice(lists(), noSynced());
  it("a plan that arrives gets offline none and is listed", () => {
    const result: DeviceState = { ...empty, plans: [body(trip("a"))], synced: { plans: { a: 1_700_000_000_000 }, visits: {} } };
    const out = fromDevice(result, empty, lists());
    expect(out.lists.trips).toHaveLength(1);
    expect(out.lists.trips[0]).toMatchObject({ slug: "a", offline: "none", changedAt: 1_700_000_000_000 });
    expect(out.arrived).toEqual(["a"]);
    expect(out.synced.plans).toEqual({ a: 1_700_000_000_000 });
  });
  it("an update keeps local offline and eve, and drops weather only when the date changed", () => {
    const w = { url: "u", topUrl: null, below: null, above: null, at: null };
    const local = lists({ trips: [trip("a", { offline: "ok", eve: true, weather: w, changedAt: 100 })] });
    const before = toDevice(local, noSynced());
    const same = fromDevice({ ...before, plans: [body(trip("a", { name: "New", changedAt: 900 }))] }, before, local);
    expect(same.lists.trips[0]).toMatchObject({ name: "New", changedAt: 900, offline: "ok", eve: true, weather: w });
    expect(same.arrived).toEqual([]);
    const moved = fromDevice({ ...before, plans: [body(trip("a", { date: "2026-09-01", changedAt: 900 }))] }, before, local);
    expect(moved.lists.trips[0]).toMatchObject({ date: "2026-09-01", offline: "ok", eve: true });
    expect(moved.lists.trips[0].weather).toBeUndefined();
  });
  it("a deletion from the server lands in removed", () => {
    const local = lists({ trips: [trip("a")] });
    const before = toDevice(local, noSynced());
    const out = fromDevice({ ...before, plans: [], synced: noSynced() }, before, local);
    expect(out.removed).toEqual(["a"]);
    expect(out.lists.trips).toEqual([]);
  });
  it("keeps a tombstone the server has not acknowledged, drops an acknowledged one", () => {
    const local = lists({ savedGone: { a: 50, b: 60 } });
    const before = toDevice(local, noSynced());
    const out = fromDevice({ ...before, plans: [{ key: "a", at: 50, gone: true }] }, before, local);
    expect(out.lists.savedGone).toEqual({ a: 50 });
  });
  it("an edit made during the exchange survives and stays unsynced", () => {
    const start = lists({ trips: [trip("a", { changedAt: 100 })] });
    const before = toDevice(start, { plans: { a: 100 }, visits: {} });
    const edited = lists({ trips: [trip("a", { name: "Edited", changedAt: 800 })] });
    const result: DeviceState = { ...before, plans: [body(trip("a", { name: "From server", changedAt: 400 }))], synced: { plans: { a: 400 }, visits: {} } };
    const out = fromDevice(result, before, edited);
    expect(out.lists.trips[0]).toMatchObject({ name: "Edited", changedAt: 800 });
    expect(out.synced.plans).toEqual({ a: 100 });
  });
  it("skips an invalid body and keeps the local version", () => {
    const local = lists({ trips: [trip("a", { changedAt: 100 })] });
    const before = toDevice(local, noSynced());
    const bad: DeviceState = { ...before, plans: [{ key: "a", at: 900, body: { slug: "a", name: 5 } }, { key: "z", at: 900, body: "nope" }] };
    const out = fromDevice(bad, before, local);
    expect(out.lists.trips.map((t) => [t.slug, t.changedAt])).toEqual([["a", 100]]);
    expect(out.arrived).toEqual([]);
  });
  it("orders trips newest savedAt first", () => {
    const old = trip("a", { savedAt: "2026-01-01T00:00:00.000Z" });
    const recent = trip("b", { savedAt: "2026-06-01T00:00:00.000Z" });
    const result: DeviceState = { ...empty, plans: [body(old), body(recent)] };
    expect(fromDevice(result, empty, lists()).lists.trips.map((t) => t.slug)).toEqual(["b", "a"]);
  });
  it("visits: arrive, vanish on server deletion, and survive an edit during the exchange", () => {
    const local = lists({ visits: [visit("p:a:2026-08-01", 10)] });
    const before = toDevice(local, noSynced());
    const arrived = fromDevice({ ...before, visits: [...before.visits, { key: "p:b:2026-08-02", at: 20, body: { slug: "b", route: "b", name: "B", date: "2026-08-02", from: "plan" } }] }, before, local);
    expect(arrived.lists.visits.map((v) => v.id).sort()).toEqual(["p:a:2026-08-01", "p:b:2026-08-02"]);
    const deleted = fromDevice({ ...before, visits: [] }, before, local);
    expect(deleted.lists.visits).toEqual([]);
    const edited = fromDevice({ ...before, visits: [] }, before, lists({ visits: [visit("p:a:2026-08-01", 99)] }));
    expect(edited.lists.visits).toEqual([visit("p:a:2026-08-01", 99)]);
  });
});

describe("two devices through the real store", () => {
  const post = async (r: SyncRequest): Promise<SyncAnswer> => JSON.parse(JSON.stringify(await store.syncAccount("two-devices", JSON.parse(JSON.stringify(r)) as SyncRequest, Date.now())));
  interface Device { lists: DeviceLists; synced: DeviceState["synced"] }
  async function sync(d: Device): Promise<void> {
    const before = toDevice(d.lists, d.synced);
    const result = await runSync(before, post);
    const out = fromDevice(result, before, d.lists);
    d.lists = out.lists;
    d.synced = out.synced;
  }

  it("merges plans and visits, keeps device fields apart and carries a deletion", async () => {
    const past = Date.now() - 60_000;
    const phone: Device = { lists: lists({ trips: [trip("a", { changedAt: past })], visits: [visit("p:a:2026-08-01", past)] }), synced: noSynced() };
    const laptop: Device = { lists: lists({ trips: [trip("b", { changedAt: past + 1 })] }), synced: noSynced() };
    await sync(phone);
    await sync(laptop);
    await sync(phone);
    for (const d of [phone, laptop]) expect(d.lists.trips.map((t) => t.slug).sort()).toEqual(["a", "b"]);
    expect(laptop.lists.visits.map((v) => v.id)).toEqual(["p:a:2026-08-01"]);
    expect(laptop.lists.trips.find((t) => t.slug === "a")?.offline).toBe("none");
    expect(phone.lists.trips.find((t) => t.slug === "a")?.offline).toBe("ok");
    // The laptop removes A.
    const a = laptop.lists.trips.find((t) => t.slug === "a") as SavedTrip;
    laptop.lists = { ...laptop.lists, trips: laptop.lists.trips.filter((t) => t.slug !== "a"), savedGone: { a: Math.max(Date.now(), (a.changedAt ?? 0) + 1) } };
    await sync(laptop);
    await sync(phone);
    expect(phone.lists.trips.map((t) => t.slug)).toEqual(["b"]);
    expect(phone.lists.visits.map((v) => v.id)).toEqual(["p:a:2026-08-01"]);
  });
});
