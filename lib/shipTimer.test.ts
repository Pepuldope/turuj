import { describe, expect, it } from "vitest";
import { isShipTime, shipTimer, startShipBatch } from "@/lib/shipTimer";

type Call = { url: string; init: RequestInit };

/** A fetch that answers with the given statuses in turn and remembers what it was asked. */
function fakeFetch(statuses: (number | "down")[]) {
  const calls: Call[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const s = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    if (s === "down") throw new Error("network down");
    return new Response(s === 204 ? null : `{"message":"status ${s}"}`, { status: s });
  }) as unknown as typeof fetch;
  return { calls, doFetch };
}

describe("06:30 in Slovakia", () => {
  it("is 05:30 UTC in winter and 04:30 UTC in summer", () => {
    expect(isShipTime(Date.UTC(2026, 10, 26, 5, 30))).toBe(true);
    expect(isShipTime(Date.UTC(2026, 10, 26, 4, 30))).toBe(false);
    expect(isShipTime(Date.UTC(2027, 6, 1, 4, 30))).toBe(true);
    expect(isShipTime(Date.UTC(2027, 6, 1, 5, 30))).toBe(false);
  });

  it("matches exactly one of the 5-minute cron runs of a day", () => {
    const day = Date.UTC(2026, 10, 26);
    let hits = 0;
    for (let min = 0; min < 24 * 60; min += 5) if (isShipTime(day + min * 60_000)) hits++;
    expect(hits).toBe(1);
  });

  it("still matches on the two days the clocks change", () => {
    for (const day of [Date.UTC(2027, 2, 28), Date.UTC(2027, 9, 31)]) {
      let hits = 0;
      for (let min = 0; min < 24 * 60; min += 5) if (isShipTime(day + min * 60_000)) hits++;
      expect(hits).toBe(1);
    }
  });
});

describe("starting the Ship batch workflow", () => {
  it("asks GitHub for a real run of ship-batch.yml on main", async () => {
    const { calls, doFetch } = fakeFetch([204]);
    expect(await startShipBatch("tok", doFetch, 0)).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.github.com/repos/Pepuldope/turuj/actions/workflows/ship-batch.yml/dispatches");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ ref: "main", inputs: { dry_run: "false" } });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["User-Agent"]).toBeTruthy();
  });

  it("tries again after a server error or a network error", async () => {
    const { calls, doFetch } = fakeFetch([502, "down", 204]);
    expect(await startShipBatch("tok", doFetch, 0)).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });

  it("does not repeat a refused token", async () => {
    const { calls, doFetch } = fakeFetch([401]);
    const res = await startShipBatch("tok", doFetch, 0);
    expect(res).toMatchObject({ ok: false, status: 401 });
    expect(calls).toHaveLength(1);
  });
});

describe("the cron run", () => {
  const AT = Date.UTC(2026, 10, 26, 5, 30);

  it("does nothing outside 06:30", async () => {
    const { calls, doFetch } = fakeFetch([204]);
    expect(await shipTimer(Date.UTC(2026, 10, 26, 5, 35), { SHIP_BATCH_TOKEN: "tok" }, doFetch, 0)).toBe("not-time");
    expect(calls).toHaveLength(0);
  });

  it("does nothing without the token (previews, forks)", async () => {
    const { calls, doFetch } = fakeFetch([204]);
    expect(await shipTimer(AT, {}, doFetch, 0)).toBe("no-token");
    expect(calls).toHaveLength(0);
  });

  it("starts the workflow at 06:30", async () => {
    const { calls, doFetch } = fakeFetch([204]);
    expect(await shipTimer(AT, { SHIP_BATCH_TOKEN: "tok" }, doFetch, 0)).toBe("started");
    expect(calls).toHaveLength(1);
  });

  it("sends one e-mail to the contact address when GitHub refuses", async () => {
    const { calls, doFetch } = fakeFetch([403, 200]);
    expect(await shipTimer(AT, { SHIP_BATCH_TOKEN: "github_pat_SECRET", RESEND_API_KEY: "re" }, doFetch, 0)).toBe("failed");
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe("https://api.resend.com/emails");
    const mail = JSON.parse(String(calls[1].init.body));
    expect(mail.to).toEqual(["info@turuj.sk"]);
    expect(mail.text).toContain("GitHub answered 403");
    expect(mail.text).not.toContain("github_pat_SECRET");
  });
});
