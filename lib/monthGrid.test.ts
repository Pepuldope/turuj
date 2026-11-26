import { describe, expect, it } from "vitest";
import { compareMonths, monthGrid, monthOf, monthTitle, shiftMonth, weekdayHeads } from "@/lib/monthGrid";

describe("monthGrid", () => {
  it("starts the week on Monday", () => {
    // 1 November 2026 is a Sunday.
    const g = monthGrid({ year: 2026, month: 11 });
    expect(g[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(g[1][0]).toBe("2026-11-02");
    expect(g.at(-1)).toEqual(["2026-11-30", null, null, null, null, null, null]);
    expect(g).toHaveLength(6);
  });

  it("has every day of the month once, in whole weeks", () => {
    for (const [year, month, days] of [[2026, 2, 28], [2028, 2, 29], [2026, 6, 30], [2026, 12, 31]] as const) {
      const g = monthGrid({ year, month });
      expect(g.every((w) => w.length === 7)).toBe(true);
      const all = g.flat().filter((d) => d !== null);
      expect(all).toHaveLength(days);
      expect(all[0]).toBe(`${year}-${String(month).padStart(2, "0")}-01`);
      expect(new Set(all).size).toBe(days);
    }
  });

  it("fits a month that starts on Monday in four or five weeks", () => {
    // February 2027 starts on a Monday and has 28 days.
    const g = monthGrid({ year: 2027, month: 2 });
    expect(g).toHaveLength(4);
    expect(g[0][0]).toBe("2027-02-01");
    expect(g[3][6]).toBe("2027-02-28");
  });
});

describe("months", () => {
  it("reads the month of a date", () => {
    expect(monthOf("2026-11-26")).toEqual({ year: 2026, month: 11 });
  });

  it("moves over the year's end both ways", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 11 }, -12)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 3 }, -27)).toEqual({ year: 2023, month: 12 });
  });

  it("compares months", () => {
    expect(compareMonths({ year: 2026, month: 11 }, { year: 2026, month: 11 })).toBe(0);
    expect(compareMonths({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
    expect(compareMonths({ year: 2026, month: 2 }, { year: 2026, month: 1 })).toBeGreaterThan(0);
  });

  it("names the month and the days in both languages", () => {
    expect(monthTitle({ year: 2026, month: 11 })).toBe("november 2026");
    expect(monthTitle({ year: 2026, month: 3 }, "en")).toBe("March 2026");
    expect(weekdayHeads()).toEqual(["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]);
    expect(weekdayHeads("en")[0]).toBe("Mo");
  });
});
