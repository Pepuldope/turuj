import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareClosures } from "./tanapCompare";
import { fetchOfficialClosures, parseTanapChart } from "./tanapSource";

const html = readFileSync(new URL("./__fixtures__/tanap-uzaveryTURISTIKA.html", import.meta.url), "utf8");
const rules = (JSON.parse(readFileSync(new URL("../data/closure-rules.json", import.meta.url), "utf8")) as { rules: { id: string; starts_on: string; ends_on: string }[] }).rules;

describe("parseTanapChart", () => {
  it("turns the allowed periods of the §4 hiking rows into closures", () => {
    const r = parseTanapChart(html, 2026);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.closures.map((c) => [c.ref.slice(0, 30), c.starts_on, c.ends_on])).toEqual([
      ["Pešia turistika so sezónnou uz", "2026-11-01", "2027-05-31"],
      ["Pešia turistika na chodníku Ju", "2026-11-01", "2027-04-30"],
      ["Pešia turistika na chodníku Sy", "2026-12-15", "2027-04-30"],
    ]);
  });

  it("matches the TANAP rules in data/closure-rules.json", () => {
    const r = parseTanapChart(html, 2026);
    if (!r.ok) throw new Error(r.reason);
    expect(compareClosures(rules, r.closures)).toEqual([]);
  });

  it("reports a changed date as a difference", () => {
    const changed = html.replace("segs:[[doy(6,1),doy(10,31)]] },\n  { label:'§4 Pešia turistika na chodníku Juráň", "segs:[[doy(6,15),doy(10,31)]] },\n  { label:'§4 Pešia turistika na chodníku Juráň");
    expect(changed).not.toBe(html);
    const r = parseTanapChart(changed, 2026);
    if (!r.ok) throw new Error(r.reason);
    expect(compareClosures(rules, r.closures).length).toBeGreaterThan(0);
  });

  it("says unavailable, not different, when the page is not the known shape", () => {
    expect(parseTanapChart("<html>Just a moment...</html>", 2026).ok).toBe(false);
    expect(parseTanapChart(html.replace(/sezónnou uzáverou/g, "x"), 2026).ok).toBe(false);
  });
});

describe("fetchOfficialClosures", () => {
  it("maps a 403 or a network error to unavailable", async () => {
    expect(await fetchOfficialClosures(2026, (async () => new Response("no", { status: 403 })) as typeof fetch)).toEqual({ ok: false, reason: "tanap.sk answered HTTP 403" });
    const r = await fetchOfficialClosures(2026, (async () => { throw new Error("boom"); }) as typeof fetch);
    expect(r.ok).toBe(false);
  });
  it("parses a good answer and sends a descriptive User-Agent", async () => {
    let ua = "";
    const r = await fetchOfficialClosures(2026, (async (_u: unknown, init?: RequestInit) => { ua = String((init?.headers as Record<string, string>)["User-Agent"]); return new Response(html); }) as typeof fetch);
    expect(r.ok).toBe(true);
    expect(ua).toContain("Turuj");
  });
});
