import { describe, expect, it } from "vitest";
import { nextPlan, planDay, planToAsk, stillPlanned } from "@/lib/nextPlan";

const plan = (slug: string, date: string, time = "09:00", more: { doneAt?: string; savedAt?: string } = {}) => ({
  slug,
  date,
  time,
  savedAt: more.savedAt ?? "2026-11-20T10:00:00.000Z",
  ...(more.doneAt ? { doneAt: more.doneAt } : {}),
});

const TODAY = "2026-11-25";

describe("stillPlanned", () => {
  it("counts today and later days", () => {
    expect(stillPlanned(plan("a", "2026-11-25"), TODAY)).toBe(true);
    expect(stillPlanned(plan("a", "2026-11-28"), TODAY)).toBe(true);
  });

  it("drops a day that has passed", () => {
    expect(stillPlanned(plan("a", "2026-11-24"), TODAY)).toBe(false);
  });

  it("drops a trip already marked as done", () => {
    expect(stillPlanned(plan("a", "2026-11-28", "09:00", { doneAt: "2026-11-25T08:00:00.000Z" }), TODAY)).toBe(false);
  });
});

describe("nextPlan", () => {
  it("is nothing without a plan ahead", () => {
    expect(nextPlan([], TODAY)).toBeNull();
    expect(nextPlan([plan("old", "2026-11-21")], TODAY)).toBeNull();
  });

  it("picks the nearest day, whatever the order of the list", () => {
    const list = [plan("far", "2026-12-05"), plan("near", "2026-11-28"), plan("past", "2026-11-21")];
    expect(nextPlan(list, TODAY)?.slug).toBe("near");
    expect(nextPlan([...list].reverse(), TODAY)?.slug).toBe("near");
  });

  it("picks the earlier departure on the same day", () => {
    expect(nextPlan([plan("late", "2026-11-28", "13:30"), plan("early", "2026-11-28", "08:15")], TODAY)?.slug).toBe("early");
  });

  it("picks the one saved last when day and time are the same", () => {
    const list = [plan("first", "2026-11-28", "09:00", { savedAt: "2026-11-20T10:00:00.000Z" }), plan("second", "2026-11-28", "09:00", { savedAt: "2026-11-22T10:00:00.000Z" })];
    expect(nextPlan(list, TODAY)?.slug).toBe("second");
  });

  it("skips a nearer trip that is already done", () => {
    const list = [plan("done", "2026-11-26", "09:00", { doneAt: "2026-11-25T08:00:00.000Z" }), plan("open", "2026-11-28")];
    expect(nextPlan(list, TODAY)?.slug).toBe("open");
  });

  it("keeps today's plan after its departure time", () => {
    expect(nextPlan([plan("today", "2026-11-25", "06:00")], TODAY)?.slug).toBe("today");
  });
});

describe("planDay", () => {
  it("says dnes and zajtra with the date", () => {
    expect(planDay("2026-11-25", TODAY)).toEqual({ word: "dnes", date: "25. 11." });
    expect(planDay("2026-11-26", TODAY)).toEqual({ word: "zajtra", date: "26. 11." });
  });

  it("names the weekday further out", () => {
    expect(planDay("2026-11-28", TODAY)).toEqual({ word: "sobota", date: "28. 11." });
  });

  it("crosses the end of a month and of a year", () => {
    expect(planDay("2026-12-01", "2026-11-30")).toEqual({ word: "zajtra", date: "1. 12." });
    expect(planDay("2027-01-01", "2026-12-31")).toEqual({ word: "zajtra", date: "1. 1." });
  });

  it("speaks English on /en", () => {
    expect(planDay("2026-11-25", TODAY, "en")).toEqual({ word: "today", date: "25 Nov" });
    expect(planDay("2026-11-28", TODAY, "en")).toEqual({ word: "Saturday", date: "28 Nov" });
  });
});

describe("planToAsk", () => {
  const open = (slug: string, date: string, more: { doneAt?: string; skipAsk?: boolean } = {}) => ({ ...plan(slug, date), ...more });

  it("is nothing when no plan has passed", () => {
    expect(planToAsk([], TODAY)).toBeNull();
    expect(planToAsk([open("today", "2026-11-25"), open("later", "2026-11-28")], TODAY)).toBeNull();
  });

  it("picks the most recent day that has passed", () => {
    expect(planToAsk([open("old", "2026-11-18"), open("new", "2026-11-24"), open("mid", "2026-11-21")], TODAY)?.slug).toBe("new");
  });

  it("skips plans that are done or skipped", () => {
    const list = [open("done", "2026-11-24", { doneAt: "2026-11-25T08:00:00.000Z" }), open("skipped", "2026-11-23", { skipAsk: true }), open("open", "2026-11-20")];
    expect(planToAsk(list, TODAY)?.slug).toBe("open");
  });

  it("stops asking after maxDays", () => {
    expect(planToAsk([open("a", "2026-11-10")], TODAY)).toBeNull();
    expect(planToAsk([open("a", "2026-11-11")], TODAY)?.slug).toBe("a");
    expect(planToAsk([open("a", "2026-11-20")], TODAY, 3)).toBeNull();
  });
});
