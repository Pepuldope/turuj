import { describe, expect, it } from "vitest";
import { dayMonthOf, inYearlyRange, monthDayOf, pluralClass, todayMonthDay } from "@/lib/closedToday";

describe("inYearlyRange", () => {
  it("handles a range inside one year, both ends included", () => {
    expect(inYearlyRange("04-01", "04-30", "04-01")).toBe(true);
    expect(inYearlyRange("04-01", "04-30", "04-15")).toBe(true);
    expect(inYearlyRange("04-01", "04-30", "04-30")).toBe(true);
    expect(inYearlyRange("04-01", "04-30", "03-31")).toBe(false);
    expect(inYearlyRange("04-01", "04-30", "05-01")).toBe(false);
  });
  it("handles a range that wraps the new year (1 Nov - 31 May)", () => {
    expect(inYearlyRange("11-01", "05-31", "11-01")).toBe(true);
    expect(inYearlyRange("11-01", "05-31", "12-31")).toBe(true);
    expect(inYearlyRange("11-01", "05-31", "01-01")).toBe(true);
    expect(inYearlyRange("11-01", "05-31", "05-31")).toBe(true);
    expect(inYearlyRange("11-01", "05-31", "06-01")).toBe(false);
    expect(inYearlyRange("11-01", "05-31", "08-15")).toBe(false);
    expect(inYearlyRange("11-01", "05-31", "10-31")).toBe(false);
  });
});

describe("helpers", () => {
  it("cuts MM-DD out of an ISO date", () => expect(monthDayOf("2026-11-01")).toBe("11-01"));
  it("formats a day and month", () => expect(dayMonthOf("05-31")).toBe("31. 5."));
  it("uses the Slovak date, not the device's", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Slovakia.
    expect(todayMonthDay(new Date("2026-10-31T23:30:00Z"))).toBe("11-01");
    expect(todayMonthDay(new Date("2026-07-01T10:00:00Z"))).toBe("07-01");
  });
  it("picks the Slovak plural class", () => {
    expect([1, 2, 4, 5, 11, 0].map(pluralClass)).toEqual(["one", "few", "few", "many", "many", "many"]);
  });
});
