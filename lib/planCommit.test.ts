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

describe("use day and list_empty", () => {
  it("marks the day as used once per page load, by a trip view or a save", async () => {
    const beacons: string[] = [];
    vi.stubGlobal("window", { umami: { track: () => {} }, location: { host: "turuj.sk", pathname: "/" } });
    vi.stubGlobal("navigator", { webdriver: false, sendBeacon: (url: string) => (beacons.push(url), true) });
    vi.stubGlobal("localStorage", { getItem: () => null });
    const { track } = await import("./analytics");
    track("start_set", { how: "gps" });
    expect(beacons.filter((u) => u.includes("used=1"))).toEqual([]);
    track("trip_open", { trail: "a" });
    track("trip_saved", { trail: "a" });
    expect(beacons.filter((u) => u.includes("used=1"))).toEqual(["/api/visit?used=1"]);
  });

  it("sends list_empty once for the same filters in a row", async () => {
    const { sent } = await setup();
    const { trackListEmpty } = await import("./analytics");
    trackListEmpty({ kind: "hrad" });
    trackListEmpty({ kind: "hrad" });
    trackListEmpty({ kind: "vrchol" });
    expect(sent.filter(([n]) => n === "list_empty").map(([, d]) => d)).toEqual([{ kind: "hrad" }, { kind: "vrchol" }]);
  });
});
