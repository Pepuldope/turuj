// Sign-in (lib/auth.ts) against an in-memory SQLite in D1's shape, as in lib/tripDb.test.ts.
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "@/lib/d1";

interface DatabaseSync {
  prepare(sql: string): { run(...v: unknown[]): unknown; get(...v: unknown[]): unknown; all(...v: unknown[]): unknown[] };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSync };

let db: D1Like | null = null;
vi.mock("@/lib/d1", () => ({ getDb: async () => db }));
const auth = await import("@/lib/auth");

function d1(sqlite: DatabaseSync): D1Like {
  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...v) => statement(sql, v),
    run: async () => sqlite.prepare(sql).run(...values),
    first: async <T,>() => (sqlite.prepare(sql).get(...values) as T | undefined) ?? null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...values) as T[] }),
  });
  return { prepare: (sql) => statement(sql), batch: async (s) => { for (const x of s) await x.run(); } };
}

// One database for the file: the tables are made once per process, as on the Worker.
db = d1(new DatabaseSync(":memory:"));

const req = (token?: string) => new Request("https://turuj.sk/", { headers: token ? { cookie: `a=1; ${auth.SESSION_COOKIE}=${token}` } : {} });

describe("helpers", () => {
  it("cleans emails", () => {
    expect(auth.cleanEmail("  Peter@Gmail.COM ")).toBe("peter@gmail.com");
    expect(auth.cleanEmail("peter@gmail")).toBeNull();
    expect(auth.cleanEmail("a b@c.sk")).toBeNull();
    expect(auth.cleanEmail(3)).toBeNull();
  });
  it("only comes back to our own pages", () => {
    expect(auth.safeNext("/trasa/x?d=1")).toBe("/trasa/x?d=1");
    expect(auth.safeNext("//evil.com")).toBe("/");
    expect(auth.safeNext("/\\evil.com")).toBe("/");
    expect(auth.safeNext("https://evil.com")).toBe("/");
    expect(auth.safeNext(null)).toBe("/");
  });
  it("makes 6-digit codes", () => {
    for (let i = 0; i < 50; i++) expect(auth.randomCode()).toMatch(/^\d{6}$/);
  });
});

describe("email code", () => {
  beforeEach(() => vi.useRealTimers());

  it("signs in with the right code, once", async () => {
    expect(await auth.newLoginCode("a@b.sk", "123456")).toBe("ok");
    expect(await auth.newLoginCode("a@b.sk", "654321")).toBe("wait");
    expect(await auth.checkLoginCode("a@b.sk", "111111")).toBe("wrong");
    expect(await auth.checkLoginCode("a@b.sk", "123456")).toBe("ok");
    expect(await auth.checkLoginCode("a@b.sk", "123456")).toBe("expired");
  });

  it("ends the code after too many wrong tries", async () => {
    expect(await auth.newLoginCode("c@b.sk", "123456")).toBe("ok");
    for (let i = 1; i < auth.CODE_TRIES; i++) expect(await auth.checkLoginCode("c@b.sk", "000000")).toBe("wrong");
    expect(await auth.checkLoginCode("c@b.sk", "000000")).toBe("expired");
    expect(await auth.checkLoginCode("c@b.sk", "123456")).toBe("expired");
  });

  it("lets a code run out", async () => {
    vi.useFakeTimers({ now: Date.now() });
    expect(await auth.newLoginCode("d@b.sk", "123456")).toBe("ok");
    vi.setSystemTime(Date.now() + (auth.CODE_MIN + 1) * 60_000);
    expect(await auth.checkLoginCode("d@b.sk", "123456")).toBe("expired");
  });
});

describe("accounts and sessions", () => {
  it("keeps one account per email, and Google joins it", async () => {
    const a = await auth.accountFor("e@b.sk");
    const g = await auth.accountFor("e@b.sk", { sub: "g1", name: "Eva" });
    expect(g.id).toBe(a.id);
    expect(g.name).toBe("Eva");
    expect((await auth.accountFor("e@b.sk")).name).toBe("Eva");
  });

  it("starts, reads and ends a session", async () => {
    const a = await auth.accountFor("f@b.sk");
    const token = await auth.startSession(a.id, "email");
    expect(await auth.currentAccount(req(token))).toMatchObject({ id: a.id, email: "f@b.sk" });
    expect(await auth.currentAccount(req("x".repeat(43)))).toBeNull();
    expect(await auth.currentAccount(req())).toBeNull();
    await auth.endSession(req(token));
    expect(await auth.currentAccount(req(token))).toBeNull();
  });

  it("counts accounts and sign-ins for /statistiky", async () => {
    const a = await auth.accountFor("g@b.sk", { sub: "g2", name: null });
    await auth.startSession(a.id, "google");
    const stats = await auth.accountStats();
    const month = new Date().toISOString().slice(0, 7);
    expect(stats?.total).toBe(3); // e@, f@ and g@ from these tests
    expect(stats?.months[0]).toMatchObject({ month, created: 3, google: 1, email: 1 });
  });
});

describe("passwords", () => {
  it("hashes with a salt and checks", async () => {
    const h = await auth.hashPassword("horske-chodniky");
    expect(h).toMatch(/^pbkdf2\$\d+\$/);
    expect(await auth.hashPassword("horske-chodniky")).not.toBe(h);
    expect(await auth.passwordMatches("horske-chodniky", h)).toBe(true);
    expect(await auth.passwordMatches("horske-chodnik", h)).toBe(false);
  });

  it("signs in with the password, and waits after too many wrong ones", async () => {
    const a = await auth.accountFor("p@b.sk");
    expect(await auth.passwordLogin("p@b.sk", "whatever1")).toEqual({ ok: false, why: "nopw" });
    await auth.setPassword(a.id, "spravne-heslo");
    expect(await auth.passwordLogin("nikto@b.sk", "spravne-heslo")).toEqual({ ok: false, why: "wrong" });
    expect(await auth.passwordLogin("p@b.sk", "spravne-heslo")).toMatchObject({ ok: true, account: { id: a.id } });
    for (let i = 1; i < auth.PW_TRIES; i++) expect((await auth.passwordLogin("p@b.sk", "zle-heslo"))).toEqual({ ok: false, why: "wrong" });
    expect(await auth.passwordLogin("p@b.sk", "zle-heslo")).toEqual({ ok: false, why: "locked" });
    expect(await auth.passwordLogin("p@b.sk", "spravne-heslo")).toEqual({ ok: false, why: "locked" });
    // A new password (after an email code) lifts the wait.
    await auth.setPassword(a.id, "nove-heslo-1");
    expect(await auth.passwordLogin("p@b.sk", "nove-heslo-1")).toMatchObject({ ok: true });
  });

  it("takes passwords of 8 to 200 characters", () => {
    expect(auth.okPassword("1234567")).toBe(false);
    expect(auth.okPassword("12345678")).toBe(true);
    expect(auth.okPassword("x".repeat(201))).toBe(false);
    expect(auth.okPassword(12345678)).toBe(false);
  });
});

describe("team accounts", () => {
  it("are marked per account and read back with the session", async () => {
    const a = await auth.accountFor("team@x.sk");
    const token = await auth.startSession(a.id, "email");
    expect((await auth.currentAccount(req(token)))?.team).toBe(false);
    await auth.setTeam(a.id, true);
    expect((await auth.currentAccount(req(token)))?.team).toBe(true);
    await auth.setTeam(a.id, false);
    expect((await auth.currentAccount(req(token)))?.team).toBe(false);
  });
});
