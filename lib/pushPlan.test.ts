import { describe, expect, it, vi } from "vitest";
import type { D1Like, D1Statement } from "./d1";

vi.mock("@/lib/webPush", () => ({
  newVapidKeys: async () => ({ privateJwk: {} }),
  sendPush: vi.fn(async () => "ok"),
}));

import { MAX_SENDS_PER_RUN, sendDue } from "./pushPlan";
import { sendPush } from "@/lib/webPush";

interface Row {
  endpoint: string;
  slug: string;
  kind: string;
  at: number;
  sub: string;
  message: string;
}

/** Just enough of D1 for sendDue: the plan table in memory. */
function fakeDb(rows: Row[]): D1Like {
  const stmt = (sql: string, args: unknown[] = []): D1Statement => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    run: async () => {
      if (sql.startsWith("DELETE FROM push_plan WHERE endpoint = ? AND slug = ? AND kind = ?")) {
        const i = rows.findIndex((r) => r.endpoint === args[0] && r.slug === args[1] && r.kind === args[2]);
        if (i >= 0) rows.splice(i, 1);
      }
      return {};
    },
    first: async <T>() => ({ jwk: "{}" }) as T,
    all: async <T>() => {
      const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1]);
      return { results: rows.filter((r) => r.at <= (args[0] as number)).sort((a, b) => a.at - b.at).slice(0, limit) as T[] };
    },
  });
  return { prepare: (sql) => stmt(sql), batch: async () => [] };
}

const NOW = 1_800_000_000_000;
const row = (i: number, at: number, kind = "turn"): Row => ({
  endpoint: `https://push.example/${i}`,
  slug: "trip",
  kind,
  at,
  sub: JSON.stringify({ endpoint: `https://push.example/${i}`, keys: { p256dh: "a", auth: "b" } }),
  message: "{}",
});

describe("sendDue", () => {
  it("sends at most 50 a run and leaves the rest for the next run", async () => {
    vi.mocked(sendPush).mockClear();
    const rows = Array.from({ length: 120 }, (_, i) => row(i, NOW - 1000));
    const db = fakeDb(rows);
    const first = await sendDue(db, NOW);
    expect(first.sent).toBe(MAX_SENDS_PER_RUN);
    expect(rows).toHaveLength(70);
    const second = await sendDue(db, NOW + 300_000);
    expect(second.sent).toBe(50);
    expect(rows).toHaveLength(20);
    expect((await sendDue(db, NOW + 600_000)).sent).toBe(20);
    expect(rows).toHaveLength(0);
  });

  it("drops stale walk reminders without using up the sends", async () => {
    const rows = [...Array.from({ length: 60 }, (_, i) => row(i, NOW - 40 * 60_000)), row(99, NOW - 1000)];
    const r = await sendDue(fakeDb(rows), NOW);
    expect(r).toEqual({ sent: 1, dropped: 60 });
  });
});
