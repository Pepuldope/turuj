import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setup() {
  const sent: [string, Record<string, unknown> | undefined][] = [];
  vi.stubGlobal("window", { umami: { track: (n: string, d?: Record<string, unknown>) => sent.push([n, d]) }, location: { host: "localhost", pathname: "/" } });
  vi.stubGlobal("navigator", { webdriver: false, sendBeacon: () => true });
  vi.stubGlobal("localStorage", { getItem: () => null });
  const { track } = await import("./analytics");
  return { sent, track };
}

describe("plan_commit", () => {
  it("counts a trail once per page load, whatever the person does with it", async () => {
    const { sent, track } = await setup();
    track("trip_saved", { trail: "krivan", took: "0-2 min" });
    track("share_sent", { trail: "krivan", how: "copy" });
    track("nav_open", { app: "google", trail: "krivan" });
    track("gpx_download", { trail: "sitno" });
    track("trip_open", { trail: "rozsutec" });
    const commits = sent.filter(([n]) => n === "plan_commit").map(([, d]) => [d?.trail, d?.via]);
    expect(commits).toEqual([
      ["krivan", "save"],
      ["sitno", "gpx"],
    ]);
  });

  it("holds events until Umami's script has loaded", async () => {
    vi.useFakeTimers();
    const { sent, track } = await setup();
    const umami = (window as unknown as { umami: unknown }).umami;
    (window as unknown as { umami?: unknown }).umami = undefined;
    track("shared_open", { trail: "krivan" });
    expect(sent).toEqual([]);
    (window as unknown as { umami?: unknown }).umami = umami;
    vi.advanceTimersByTime(600);
    expect(sent.map(([n]) => n)).toEqual(["shared_open"]);
    vi.useRealTimers();
  });
});
