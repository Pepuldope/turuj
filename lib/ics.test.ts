import { describe, expect, it } from "vitest";
import { buildIcs, icsEscape, icsFold } from "./ics";
import { zonedDate } from "./zoned";

const base = { name: "Kriváň, Štrbské Pleso; Tatry", url: "https://turuj.sk/trasa/krivan", date: "2026-11-08", lang: "sk" as const, uid: "krivan-2026-11-08@turuj.sk", stampMs: Date.UTC(2026, 10, 7, 12) };

describe("ics", () => {
  it("escapes commas, semicolons, backslashes and line breaks", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds at 75 octets without splitting a character", () => {
    const long = "SUMMARY:" + "š".repeat(60);
    const folded = icsFold(long);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    expect(icsFold("short")).toBe("short");
  });

  it("writes a timed event in UTC with CRLF and an alert at 19:00 the evening before", () => {
    const start = zonedDate(2026, 11, 8, 7, 30).getTime();
    const ics = buildIcs({ ...base, startMs: start, endMs: start + 6 * 3600_000 });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(ics).toContain("DTSTART:20261108T063000Z");
    expect(ics).toContain("DTEND:20261108T123000Z");
    expect(ics).toContain("SUMMARY:Výlet: Kriváň\\, Štrbské Pleso\\; Tatry");
    expect(ics).toContain("URL:https://turuj.sk/trasa/krivan");
    expect(ics.replace(/\r\n /g, "")).toContain("Časy sú odhad. Na horách rozhoduje počasie a vaše sily.");
    // 19:00 on the 7th to 07:30 on the 8th is 12.5 hours.
    expect(ics).toContain("TRIGGER:-PT750M");
    expect(ics).toContain("BEGIN:VALARM");
  });

  it("writes an all-day event with the alert 5 hours before midnight", () => {
    const ics = buildIcs({ ...base, startMs: null });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261108");
    expect(ics).toContain("DTEND;VALUE=DATE:20261109");
    expect(ics).toContain("TRIGGER:-PT300M");
  });

  it("counts the alert across a clock change", () => {
    // 2026-10-25: clocks go back at 03:00; 19:00 on the 24th to 07:00 on the 25th is 12 hours of wall clock, 13 real.
    const start = zonedDate(2026, 10, 25, 7, 0).getTime();
    expect(buildIcs({ ...base, date: "2026-10-25", startMs: start })).toContain("TRIGGER:-PT780M");
  });
});
