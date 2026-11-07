import { describe, expect, it } from "vitest";
import {
  aboutTeaser,
  monthGroups,
  closureSentence,
  closureTeaser,
  departureTeaser,
  parkingTeaser,
  transitTeaser,
  departureSentence,
  durationSentence,
  hasDatedClosure,
  howLongHeading,
  monthTable,
  startLines,
  subtitle,
  transitSentence,
} from "@/lib/tripAnswers";
import { winterTimedMonths } from "@/lib/tripAnswers";
import type { MonthRow, StartLine } from "@/lib/tripAnswers";
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
    expect(sk).toMatch(/^Jún – október: najneskôr medzi \d\d:\d\d a \d\d:\d\d podľa mesiaca\.$/);
    expect(sk).not.toMatch(/január|december|v júni/);
    const en = departureSentence("en", rows, [tanap]);
    expect(en).toContain("June – October: between");
    expect(sk).not.toContain("TANAP");
  });

  it("hasDatedClosure tells dated from yearly", () => {
    const dated: Closure = { ...tanap, kind: "jednorazova", starts_on: "2026-03-01", ends_on: "2026-03-31" };
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

describe("month table: partly closed months and dated closures never show a bare time", () => {
  const base: Closure = { id: "tanap-x", trail_id: "x", kind: "rocna", starts_on: "2000-10-16", ends_on: "2000-05-31", reason: "r", source_url: "https://example.org", verified_on: "2026-10-01" };
  const rows = monthTable(TATRY, 4 * 60, [base]);
  const row = (m: number) => rows.find((r) => r.month === m)!;

  it("yearly 16 Oct - 31 May: October is partial, no time", () => {
    expect(row(10).latest).toBeNull();
    expect(row(10).closedBy).toBeNull();
    expect(row(10).partial).toEqual({ by: "TANAP", span: "16. 10.–31. 10." });
    expect(row(11).closedBy).toBe("TANAP");
    expect(row(5).closedBy).toBe("TANAP");
    for (const m of [6, 7, 8, 9]) expect(row(m).latest).not.toBeNull();
  });

  it("yearly closure ending 14 Nov: November partial with its own span", () => {
    const c = { ...base, starts_on: "2000-11-01", ends_on: "2000-11-14" };
    const r = monthTable(TATRY, 4 * 60, [c]).find((x) => x.month === 11)!;
    expect(r.latest).toBeNull();
    expect(r.partial).toEqual({ by: "TANAP", span: "1. 11.–14. 11." });
  });

  it("sentence names only months that have a time and never the partial one", () => {
    const sk = departureSentence("sk", rows, [base]);
    expect(sk).toMatch(/^Jún – september: najneskôr medzi \d\d:\d\d a \d\d:\d\d podľa mesiaca\.$/);
    expect(departureSentence("en", rows, [base])).toContain("June – September");
  });

  it("year-wrapping 1 Nov - 31 May stays: Nov-May closed, Jun-Oct times", () => {
    const c = { ...base, starts_on: "2000-11-01" };
    const r = monthTable(TATRY, 4 * 60, [c]);
    for (const x of r) {
      const closed = x.month >= 11 || x.month <= 5;
      expect(x.closedBy).toBe(closed ? "TANAP" : null);
      expect(x.partial).toBeNull();
      expect(x.latest === null).toBe(closed);
    }
  });

  it("names the months that cannot be done in daylight separately", () => {
    const wrap = { ...base, starts_on: "2000-11-01" };
    const walk = [600, 660, 720, 780].find((w) => { const t = monthTable(TATRY, w, [wrap]).filter((x) => !x.closedBy); return t.some((x) => x.latest) && t.some((x) => !x.latest); }) ?? 0;
    expect(walk).toBeGreaterThan(0);
    const long = monthTable(TATRY, walk, [wrap]);
    const timed = long.filter((x) => x.latest);
    const untimed = long.filter((x) => !x.latest && !x.closedBy);
    expect(timed.length).toBeGreaterThan(0);
    expect(untimed.length).toBeGreaterThan(0);
    const sk = departureSentence("sk", long, [{ ...base, starts_on: "2000-11-01" }]);
    expect(sk).toContain("ale za svetla túru nestihnete (");
    expect(sk).not.toContain("podľa mesiaca; od");
    expect(sk).toMatch(/^[^:]+: najneskôr/);
  });

  it("dated closure: sentence opens with the warning and months are marked", () => {
    const dated: Closure = { ...base, id: "malafatra-1", kind: "jednorazova", starts_on: "2027-06-01", ends_on: "2027-09-30" };
    const r = monthTable(TATRY, 4 * 60, [dated], "2026-11-06");
    for (const x of r) {
      const closed = x.month >= 6 && x.month <= 9;
      expect(x.closedBy !== null).toBe(closed);
      expect(x.latest === null).toBe(closed);
    }
    const sk = departureSentence("sk", r, [dated], "2026-11-06");
    expect(sk).toMatch(/^Pozor, na trase je hlásená uzávera od 1\. 6\. 2027 do 30\. 9\. 2027, pozrite časť Uzávery a poplatky\. Mimo uzávery /);
    expect(sk).not.toMatch(/V júni/);
    expect(departureSentence("en", r, [dated], "2026-11-06")).toContain("Warning: a closure is reported");
  });

  it("dated closure that starts mid-month gives a partial month", () => {
    const dated: Closure = { ...base, kind: "jednorazova", starts_on: "2027-06-10", ends_on: "2027-06-20" };
    const r = monthTable(TATRY, 4 * 60, [dated], "2026-11-06").find((x) => x.month === 6)!;
    expect(r.latest).toBeNull();
    expect(r.partial?.span).toBe("10. 6.–20. 6.");
  });

  it("an expired dated closure is ignored; a future one still warns", () => {
    const old: Closure = { ...base, kind: "jednorazova", starts_on: "2025-06-01", ends_on: "2025-06-30" };
    expect(monthTable(TATRY, 4 * 60, [old], "2026-11-06")).toEqual(monthTable(TATRY, 4 * 60));
    expect(departureSentence("sk", monthTable(TATRY, 4 * 60, [old], "2026-11-06"), [old], "2026-11-06")).toMatch(/^V júni/);
  });

  it("all 12 months closed never quotes a time", () => {
    const all: Closure = { ...base, starts_on: "2000-01-01", ends_on: "2000-12-31" };
    const sk = departureSentence("sk", monthTable(TATRY, 4 * 60, [all]), [all]);
    expect(sk).toBe("Trasa je uzavretá celý rok (TANAP).");
    const dated: Closure = { ...all, kind: "jednorazova", starts_on: "2027-01-01", ends_on: "2027-12-31" };
    const s2 = departureSentence("sk", monthTable(TATRY, 4 * 60, [dated], "2026-11-06"), [dated], "2026-11-06");
    expect(s2).not.toMatch(/\d\d:\d\d/);
  });

  it("every month at least partly closed gives no time", () => {
    const a: Closure = { ...base, starts_on: "2000-01-01", ends_on: "2000-06-30" };
    const b: Closure = { ...base, id: "tanap-y", starts_on: "2000-07-05", ends_on: "2000-12-31" };
    const r = monthTable(TATRY, 4 * 60, [a, b]);
    expect(r.every((x) => x.latest === null)).toBe(true);
    expect(departureSentence("sk", r, [a, b])).not.toMatch(/\d\d:\d\d/);
  });

  it("no closures and undefined arrays leave the table clean", () => {
    const clean = monthTable(TATRY, 4 * 60);
    expect(clean.every((x) => x.closedBy === null && x.partial === null && x.latest)).toBe(true);
    expect(monthTable(TATRY, 4 * 60, undefined)).toEqual(clean);
    expect(departureSentence("sk", clean, undefined)).toMatch(/^V júni treba vyraziť/);
  });

  it("DST months get a time like any other", () => {
    const r = monthTable(TATRY, 4 * 60);
    for (const m of [3, 4, 10, 11]) expect(r.find((x) => x.month === m)!.latest).not.toBeNull();
  });
});

describe("winter note", () => {
  const row = (month: number, extra: Partial<MonthRow> = {}): MonthRow => ({ month, latest: null, sunset: new Date(0), closedBy: null, partial: null, ...extra });
  it("marks open winter months only", () => {
    const rows = [1, 2, 3, 4, 11, 12].map((m) => row(m, m === 2 ? { closedBy: "TANAP" } : m === 3 ? { partial: { by: "TANAP", span: "1. 3." } } : {}));
    expect([...winterTimedMonths(rows)].sort((a, b) => a - b)).toEqual([1, 11, 12]);
  });
  it("is empty when Nov-Mar are all closed", () => {
    const rows = [11, 12, 1, 2, 3, 6].map((m) => row(m, m === 6 ? {} : { closedBy: "TANAP" }));
    expect(winterTimedMonths(rows).size).toBe(0);
  });
});

describe("one-line teasers", () => {
  const tanap: Closure = {
    id: "tanap-test",
    kind: "rocna",
    starts_on: "2026-11-01",
    ends_on: "2026-05-31",
    reason: "Zimná uzávera",
    source_url: "https://example.org",
    verified_on: "2026-10-01",
  } as Closure;

  it("always states the yearly closure rule, and never calls an unknown trail open", () => {
    expect(closureTeaser("sk", [tanap])).toBe("Zatvorené každý rok 1. 11.–31. 5. (TANAP)");
    const none = closureTeaser("sk", []);
    expect(none).toBe("Stav chodníka neoverený");
    expect(none.toLowerCase()).not.toContain("otvoren");
  });

  it("says no car park and no stop plainly", () => {
    expect(parkingTeaser("sk", null)).toBe("Bez parkoviska");
    expect(transitTeaser("sk", [])).toBe("Zastávku sme nenašli");
  });

  it("names the June start from the month table", () => {
    expect(departureTeaser("sk", monthTable(TATRY, 4 * 60))).toMatch(/^V júni najneskôr \d\d:\d\d, v decembri \d\d:\d\d$/);
  });

  it("cuts the description to its first sentence", () => {
    expect(aboutTeaser("Prvá veta. Druhá veta.")).toBe("Prvá veta.");
    expect(aboutTeaser("Je to túra: 18,4 km a 1126 m stúpania. Štart je vo výške 1347 m n. m. Po modrej značke hore.")).toBe("Po modrej značke hore.");
    expect(aboutTeaser("a ".repeat(100)).endsWith("…")).toBe(true);
  });
});

describe("month groups", () => {
  const tanap = { id: "tanap-x", trail_id: "x", kind: "rocna", starts_on: "2000-11-01", ends_on: "2000-05-31", reason: "r", source_url: "https://example.org", verified_on: "2026-10-01" } as Closure;
  it("merges the closed run over the year end into one row at the top", () => {
    const g = monthGroups("sk", monthTable(TATRY, 4 * 60, [tanap]));
    expect(g[0]).toMatchObject({ kind: "closed", months: [11, 12, 1, 2, 3, 4, 5], label: "november – máj", by: "TANAP" });
    expect(g.slice(1).map((x) => (x.kind === "month" ? x.row.month : 0))).toEqual([6, 7, 8, 9, 10]);
  });
  it("is twelve plain months with no closure", () => {
    expect(monthGroups("sk", monthTable(TATRY, 4 * 60)).every((x: { kind: string }) => x.kind === "month")).toBe(true);
  });
});
