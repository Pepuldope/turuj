// Loads the SQL that pipeline/db.py writes into an in-memory SQLite (D1 is
// SQLite) and checks the database serves exactly what the static files hold.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "@/lib/d1";
import { getAllTrips, getTrip } from "@/lib/tripFiles";

// node:sqlite (Node 22.5+) is newer than Vite's list of built-ins and this
// project's Node types, so it is required directly and typed by hand.
interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): { run(...v: unknown[]): unknown; get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };

let db: D1Like | null = null;
vi.mock("@/lib/d1", () => ({ getDb: async () => db }));
const { getTripLive, listTrips, townDriveMinutes } = await import("@/lib/tripDb");

/** A D1-shaped wrapper over node:sqlite, enough for lib/tripDb. */
function d1(sqlite: DatabaseSync): D1Like {
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...v) => statement(sql, v),
    run: async () => sqlite.prepare(sql).run(...values),
    first: async <T,>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  });
  return { prepare: (sql) => statement(sql), batch: async (s) => Promise.all(s.map((x) => x.run())) };
}

beforeAll(() => {
  const sql = execFileSync("python3", ["-m", "pipeline.db"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(sql);
  db = d1(sqlite);
}, 60_000);

describe("trips from the database", () => {
  it("serves every trip exactly as the static files do", async () => {
    for (const t of await getAllTrips()) {
      const live = await getTripLive(t.slug);
      expect(live.source).toBe("databaza");
      // The list of a place's routes stays in the files; the page reads it from there.
      const file = (await getTrip(t.slug))!;
      delete file.routes;
      expect(live.trip).toEqual(file);
    }
  }, 60_000);

  it("says when a trip is unknown", async () => {
    expect((await getTripLive("neexistuje")).trip).toBeNull();
  });

  it("lists trips nearest first from a town, from the files", async () => {
    const list = await listTrips({ town: "zilina", date: "2027-04-01", limit: 5000 });
    expect(list.source).toBe("subory");
    expect(list.trips.length).toBe(Math.min(5000, (await getAllTrips()).filter((t) => !t.variant_of).length));
    const totals = list.trips.map((t) => t.total_min ?? Infinity);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    // Malá Fatra's spring closure covers Rozsutec on 1 April.
    expect(list.trips.some((t) => t.closed)).toBe(true);
  });

  it("has drive minutes per town for every main route", async () => {
    const { minutes } = await townDriveMinutes("bratislava");
    expect(Object.keys(minutes).length).toBe((await getAllTrips()).filter((t) => !t.variant_of).length);
  });

  it("falls back to the files without a loaded database", async () => {
    const saved = db;
    db = null;
    const live = await getTripLive((await getAllTrips())[0].slug);
    db = saved;
    expect(live.source).toBe("subory");
    expect(live.trip).not.toBeNull();
  });
});
