import { describe, expect, it } from "vitest";
import {
  closureSentence,
  departureSentence,
  durationSentence,
  hasDatedClosure,
  howLongHeading,
  monthTable,
  startLines,
  subtitle,
  transitSentence,
} from "@/lib/tripAnswers";
import type { StartLine } from "@/lib/tripAnswers";
import type { Closure } from "@/lib/types";
import { clock } from "@/lib/zoned";

// Poprad-Tatry area, where most trips with long days are.
const TATRY = { lat: 49.15, lon: 20.08 };

describe("month table", () => {
  const rows = monthTable(TATRY, 4 * 60);

  it("has twelve months, the same every time", () => {
    expect(rows.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(monthTable(TATRY, 4 * 60)).toEqual(rows);
  });

  it("leaves later in summer than in winter, walk plus 30 min before sunset", () => {
    const june = rows[5];
    const dec = rows[11];
    expect(june.latest && dec.latest).toBeTruthy();
    expect(clock(june.latest!) > clock(dec.latest!)).toBe(true);
    // sunset - 4 h walk - 30 min buffer, rounded down to 5 min.
    const gap = (june.sunset.getTime() - june.latest!.getTime()) / 60000;
    expect(gap).toBeGreaterThanOrEqual(270);
    expect(gap).toBeLessThan(275);
  });

  it("says a walk longer than the winter day cannot be done in daylight", () => {
    const long = monthTable(TATRY, 9 * 60);
    expect(long[11].latest).toBeNull();
    expect(long[5].latest).not.toBeNull();
    expect(departureSentence("sk", long)).toContain("v decembri túru za svetla nestihnete");
  });

  it("writes the June and December answer in one sentence", () => {
    expect(departureSentence("sk", rows)).toMatch(/^V júni treba vyraziť najneskôr o \d\d:\d\d, v decembri najneskôr o \d\d:\d\d\.$/);
    expect(departureSentence("en", rows)).toMatch(/^In June set off by \d\d:\d\d at the latest, in December by \d\d:\d\d at the latest\.$/);
  });
});

describe("duration section", () => {
  const line = (label: string, min: number, current = false): StartLine => ({ slug: label, label, min, m: 8000, ascentM: 500, current });

  it("gives the range over the starts", () => {
    expect(durationSentence("sk", [line("A", 160), line("B", 300)], false)).toBe("Od 2\u00a0h\u00a040\u00a0min do 5\u00a0h chôdze tam a späť podľa štartu.");
  });

  it("gives one time when there is one start or all are equal", () => {
    expect(durationSentence("sk", [line("A", 180)], false)).toBe("Túra trvá 3\u00a0h chôdze tam a späť.");
    expect(durationSentence("sk", [line("A", 180), line("B", 180)], true)).toBe("Túra trvá 3\u00a0h chôdze okruhom.");
  });

  it("lists loops under their start only once and tells equal starts apart by the route label", () => {
    const brief = (slug: string, start: string, label: string | null) => ({
      slug,
      route_label: label,
      start_name: start,
      parking: true,
      transit: false,
      duration_min: 120,
      distance_m: 6000,
      ascent_m: 300,
      up: [] as [number, number][],
    });
    const lines = startLines(
      "sk",
      [brief("a", "Štrba", "Hlavná cesta"), brief("b", "Štrba", "Kratšia"), brief("a/okruh", "Štrba", "Okruh")],
      {},
      { slug: "a", startName: "Štrba", walk: null, fallback: { min: 120, m: 6000, ascentM: 300 } }
    );
    expect(lines.map((l) => l.label)).toEqual(["Štrba (Hlavná cesta)", "Štrba (Kratšia)"]);
    expect(lines.map((l) => l.current)).toEqual([true, false]);
  });
});

describe("headings and sentences", () => {
  it("uses the accusative, or the plain fallback", () => {
    expect(subtitle("sk", "Babia hora", "vrchol")).toBe("Túra na Babiu horu");
    expect(howLongHeading("sk", "Kriváň", "vrchol")).toBe("Koľko trvá túra na Kriváň?");
    expect(subtitle("sk", "Nad Černovou", "vrchol")).toBe("Túra: Nad Černovou");
    expect(howLongHeading("sk", "Nad Černovou", "vrchol")).toBe("Koľko trvá túra: Nad Černovou?");
    expect(howLongHeading("en", "Kriváň", "vrchol")).toBe("How long does the hike to Kriváň take?");
  });

  it("never reads a missing closure rule as open", () => {
    const none = closureSentence("sk", []);
    expect(none).toMatch(/^Stav chodníka neoverený/);
    expect(none).not.toMatch(/otvoren/i);
  });

  it("states a closure rule with its period and manager", () => {
    const c: Closure = {
      id: "tanap-zimna",
      trail_id: "x",
      kind: "rocna",
      starts_on: "2000-11-01",
      ends_on: "2000-06-15",
      reason: "Sezónna uzávera",
      source_url: "https://example.org",
      verified_on: "2026-10-01",
    };
    expect(closureSentence("sk", [c])).toBe("Na tejto trase platí uzávera od 1. 11. do 15. 6. (TANAP).");
  });

  it("says plainly when there is no stop", () => {
    expect(transitSentence("sk", [])).toBe("Pri tejto trase sme nenašli blízku zastávku autobusu ani vlaku.");
  });
});

describe("month table under a seasonal closure", () => {
  const tanap: Closure = {
    id: "tanap-zimna",
    trail_id: "x",
    kind: "rocna",
    starts_on: "2000-11-01",
    ends_on: "2000-05-31",
    reason: "Sezónna uzávera",
    source_url: "https://example.org",
    verified_on: "2026-10-01",
  };
  const rows = monthTable(TATRY, 4 * 60, [tanap]);

  it("gives no time for a closed month, only the manager", () => {
    for (const r of rows) {
      const closed = r.month >= 11 || r.month <= 5;
      expect(r.closedBy).toBe(closed ? "TANAP" : null);
      if (closed) expect(r.latest).toBeNull();
      else expect(r.latest).not.toBeNull();
    }
  });

  it("never quotes a closed month in the sentence", () => {
    const sk = departureSentence("sk", rows, [tanap]);
    expect(sk).toMatch(/^Mimo sezónnej uzávery \(jún až október\) treba vyraziť najneskôr medzi \d\d:\d\d a \d\d:\d\d podľa mesiaca; od 1\. 11\. do 31\. 5\. je trasa uzavretá \(TANAP\)\.$/);
    expect(sk).not.toMatch(/január|december|v júni/);
    const en = departureSentence("en", rows, [tanap]);
    expect(en).toContain("Outside the seasonal closure (June to October)");
    expect(en).toContain("closed from");
  });

  it("is unchanged without a closure and ignores dated closures in the rows", () => {
    const dated: Closure = { ...tanap, kind: "jednorazova", starts_on: "2026-03-01", ends_on: "2026-03-31" };
    expect(monthTable(TATRY, 4 * 60, [dated])).toEqual(monthTable(TATRY, 4 * 60));
    expect(hasDatedClosure([dated])).toBe(true);
    expect(hasDatedClosure([tanap])).toBe(false);
  });

  it("names a closed-all-year trail plainly", () => {
    const all: Closure = { ...tanap, starts_on: "2000-01-01", ends_on: "2000-12-31" };
    expect(departureSentence("sk", monthTable(TATRY, 4 * 60, [all]), [all])).toBe("Trasa je uzavretá celý rok (TANAP).");
  });
});

describe("transit wording", () => {
  const stop = (mode: "vlak" | "autobus", name: string) => ({ id: "s", trailhead_id: "t", name, mode, location: TATRY, distance_m: 504, join: null, walk: null });
  it("uses the stop's own kind", () => {
    expect(transitSentence("sk", [stop("vlak", "Štrbské Pleso")])).toBe("Najbližšia železničná stanica je Štrbské Pleso, 504 m pešo od trasy.");
    expect(transitSentence("sk", [stop("autobus", "Popradské Pleso")])).toContain("Najbližšia autobusová zastávka je Popradské Pleso");
  });
  it("is neutral for a kind we do not know", () => {
    const odd = { ...stop("vlak", "X"), mode: "lanovka" as never };
    expect(transitSentence("sk", [odd])).toBe("Najbližšia zastávka verejnej dopravy: X, 504 m pešo od trasy.");
  });
});
