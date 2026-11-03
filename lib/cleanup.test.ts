import { describe, expect, it } from "vitest";
import { cleanup, cleanupStatements } from "@/lib/cleanup";

describe("hourly clean-up", () => {
  it("deletes expired codes and sessions and messages older than a year", () => {
    const now = Date.UTC(2026, 10, 3, 12);
    const s = cleanupStatements(now);
    expect(s[0]).toBe(`DELETE FROM login_code WHERE expires < ${now}`);
    expect(s[1]).toBe(`DELETE FROM account_session WHERE expires < ${now}`);
    expect(s[2]).toBe("DELETE FROM feedback WHERE at < '2025-11-03T12:00:00.000Z'");
  });

  it("carries on past a table that doesn't exist yet", async () => {
    const ran: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: () => { throw new Error("unused"); },
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => {
          ran.push(sql);
          if (sql.includes("feedback")) throw new Error("no such table: feedback");
          return { meta: { changes: 2 } };
        },
      }),
      batch: async () => [],
    };
    expect(await cleanup(db as never)).toBe(4);
    expect(ran).toHaveLength(3);
  });
});
