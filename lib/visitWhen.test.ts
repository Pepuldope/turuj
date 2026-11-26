import { describe, expect, it } from "vitest";
import { detailAsked, parseWhen, roughWhen, whenKey, whenLabel, whenYear, yearChoices } from "@/lib/visitWhen";
import { VISIT_DATE } from "@/lib/syncMerge";

describe("when a visit was", () => {
  it("reads the four stored forms", () => {
    expect(parseWhen("2026-11-21")).toEqual({ kind: "day", iso: "2026-11-21" });
    expect(parseWhen("2025-su")).toEqual({ kind: "season", year: 2025, season: "su" });
    expect(parseWhen("2025")).toEqual({ kind: "year", year: 2025 });
    expect(parseWhen("")).toEqual({ kind: "unknown" });
    expect(parseWhen("leto")).toEqual({ kind: "unknown" });
  });

  it("writes only forms that account sync accepts", () => {
    for (const date of [roughWhen(2025, "su"), roughWhen(2025, "wi"), roughWhen(2019, null), "2026-11-21", ""]) expect(VISIT_DATE.test(date)).toBe(true);
  });

  it("names the day the way the visitor knows it", () => {
    expect(whenLabel("2026-11-21")).toBe("21. 11. 2026");
    expect(whenLabel("2025-su")).toBe("leto 2025");
    expect(whenLabel("2025-au", "en")).toBe("autumn 2025");
    expect(whenLabel("2024")).toBe("2024");
    expect(whenLabel("")).toBe("neviem presne");
  });

  it("orders visits in time, the unknown ones first", () => {
    const dates = ["2025", "", "2026-11-21", "2025-wi", "2025-au", "2026-01-02"];
    expect([...dates].sort((a, b) => (whenKey(a) < whenKey(b) ? -1 : 1))).toEqual(["", "2025-wi", "2025", "2025-au", "2026-01-02", "2026-11-21"]);
  });

  it("knows the year", () => {
    expect(whenYear("2026-11-21")).toBe(2026);
    expect(whenYear("2025-sp")).toBe(2025);
    expect(whenYear("")).toBeNull();
  });

  it("asks the detail questions only for a known day in the last 30 days", () => {
    expect(detailAsked("2026-11-21", "2026-11-25")).toBe(true);
    expect(detailAsked("2026-10-26", "2026-11-25")).toBe(true);
    expect(detailAsked("2026-10-25", "2026-11-25")).toBe(false);
    expect(detailAsked("2026-11-26", "2026-11-25")).toBe(false);
    expect(detailAsked("2026-au", "2026-11-25")).toBe(false);
    expect(detailAsked("", "2026-11-25")).toBe(false);
  });

  it("offers this year and the three before", () => {
    expect(yearChoices("2026-11-25")).toEqual([2026, 2025, 2024, 2023]);
  });
});
