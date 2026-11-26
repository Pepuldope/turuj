import { describe, expect, it } from "vitest";
import { dayToGiveBack, defaultDay, defaultDeparture, timeGone } from "./tripSettings";

describe("defaultDeparture", () => {
  it("leaves soon during the day", () => {
    expect(defaultDeparture(new Date(2026, 9, 12, 9, 5))).toEqual({ date: "2026-10-12", time: "09:15" });
  });

  it("plans the morning, not the middle of the night", () => {
    expect(defaultDeparture(new Date(2026, 9, 12, 0, 10))).toEqual({ date: "2026-10-12", time: "08:00" });
  });

  it("moves to tomorrow when it's late", () => {
    expect(defaultDeparture(new Date(2026, 9, 12, 16, 0))).toEqual({ date: "2026-10-13", time: "08:00" });
  });
});

describe("defaultDay", () => {
  it("is tomorrow during the day", () => {
    expect(defaultDay(new Date(2026, 9, 14, 9, 30))).toBe("2026-10-15");
  });

  it("is tomorrow after midnight too", () => {
    expect(defaultDay(new Date(2026, 9, 15, 0, 30))).toBe("2026-10-16");
  });

  it("crosses the month", () => {
    expect(defaultDay(new Date(2026, 9, 31, 12, 0))).toBe("2026-11-01");
  });
});

describe("timeGone", () => {
  const now = new Date(2026, 9, 12, 10, 30);
  it("keeps a picked time on another day", () => {
    expect(timeGone("2026-10-13", "07:00", now)).toBe(false);
  });
  it("drops a time already past today", () => {
    expect(timeGone("2026-10-12", "09:00", now)).toBe(true);
    expect(timeGone("2026-10-12", "11:00", now)).toBe(false);
  });
});

describe("dayToGiveBack", () => {
  // Thursday 26 Nov 2026, 17:40 in Slovakia.
  const now = new Date("2026-11-26T16:40:00Z");

  it("gives back the day and time the lists had before the plan was opened", () => {
    expect(dayToGiveBack({ date: "2026-11-27", time: null }, now)).toEqual({ date: "2026-11-27", time: null });
    expect(dayToGiveBack({ date: "2026-11-28", time: "09:15" }, now)).toEqual({ date: "2026-11-28", time: "09:15" });
  });

  it("goes to the default day when there was none, or when that day has passed", () => {
    expect(dayToGiveBack({ date: null, time: null }, now)).toEqual({ date: "2026-11-27", time: null });
    expect(dayToGiveBack({ date: "2026-11-25", time: "08:00" }, now)).toEqual({ date: "2026-11-27", time: null });
  });

  it("drops a departure that has gone by today", () => {
    expect(dayToGiveBack({ date: "2026-11-26", time: "09:00" }, now)).toEqual({ date: "2026-11-26", time: null });
    expect(dayToGiveBack({ date: "2026-11-26", time: "19:00" }, now)).toEqual({ date: "2026-11-26", time: "19:00" });
  });
});
