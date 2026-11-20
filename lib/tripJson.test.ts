import { afterEach, describe, expect, it, vi } from "vitest";
import type { D1Like } from "@/lib/d1";
import { tripJson, tripSlug } from "@/lib/tripJson";

const BODY = '{"slug":"krivan","name":"Kriváň"}\n';

function fakeDb(row: { body: string } | null | Error) {
  const first = vi.fn(async () => {
    if (row instanceof Error) throw row;
    return row;
  });
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return { db: { prepare } as unknown as D1Like, prepare, bind, first };
}

function fakeCache(kept?: Response) {
  const cache = { match: vi.fn(async () => kept), put: vi.fn(async () => {}) };
  vi.stubGlobal("caches", { default: cache });
  return cache;
}

const ctx = () => {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p: Promise<unknown>) => void pending.push(p), done: () => Promise.all(pending) };
};
const get = (path: string, method = "GET") => new Request(`https://turuj.sk${path}`, { method });

afterEach(() => vi.unstubAllGlobals());

describe("trip files from D1", () => {
  it("a miss reads one row by slug, answers with the file's bytes and keeps it for an hour", async () => {
    const cache = fakeCache();
    const { db, bind, first } = fakeDb({ body: BODY });
    const c = ctx();
    const res = await tripJson(get("/data/trips/krivan.json"), db, c);
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe(BODY);
    expect(res?.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(res?.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(bind).toHaveBeenCalledWith("krivan");
    expect(first).toHaveBeenCalledTimes(1);
    await c.done();
    expect(cache.put).toHaveBeenCalledTimes(1);
    const [, kept] = cache.put.mock.calls[0] as unknown as [Request, Response];
    expect(kept.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("a hit in the edge cache reads no row", async () => {
    fakeCache(new Response(BODY, { headers: { "Cache-Control": "public, max-age=3600" } }));
    const { db, prepare } = fakeDb({ body: "other" });
    const res = await tripJson(get("/data/trips/krivan.json?x=1"), db, ctx());
    expect(await res?.text()).toBe(BODY);
    expect(res?.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("HEAD answers with the headers and no body", async () => {
    fakeCache();
    const res = await tripJson(get("/data/trips/krivan.json", "HEAD"), fakeDb({ body: BODY }).db, ctx());
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe("");
  });

  it("no row, a failing database or no database leaves the answer to the assets", async () => {
    fakeCache();
    expect(await tripJson(get("/data/trips/krivan.json"), fakeDb(null).db, ctx())).toBeNull();
    expect(await tripJson(get("/data/trips/krivan.json"), fakeDb(new Error("D1 down")).db, ctx())).toBeNull();
    expect(await tripJson(get("/data/trips/krivan.json"), undefined, ctx())).toBeNull();
  });

  it("works without an edge cache (local dev)", async () => {
    vi.stubGlobal("caches", undefined);
    const res = await tripJson(get("/data/trips/krivan.json"), fakeDb({ body: BODY }).db, ctx());
    expect(await res?.text()).toBe(BODY);
  });

  it("index.json and list.json never go to the database", async () => {
    fakeCache();
    const { db, prepare } = fakeDb({ body: BODY });
    expect(await tripJson(get("/data/trips/index.json"), db, ctx())).toBeNull();
    expect(await tripJson(get("/data/trips/list.json"), db, ctx())).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("odd slugs, other paths and other methods are not trip files", async () => {
    fakeCache();
    const { db, prepare } = fakeDb({ body: BODY });
    for (const path of ["/data/trips/Krivan.json", "/data/trips/a_b.json", "/data/trips/a/b.json", "/data/trips/.json", "/data/trips/krivan.json/x", "/data/drive/praha.json", "/api/vylety"]) {
      expect(await tripJson(get(path), db, ctx())).toBeNull();
    }
    expect(tripSlug(get("/data/trips/krivan.json", "POST"), "/data/trips/krivan.json")).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });
});
