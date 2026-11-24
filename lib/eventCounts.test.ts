import { describe, expect, it } from "vitest";
import { countedDetail, monthTotals } from "./eventCounts";

describe("countedDetail", () => {
  it("keeps listed actions with their allowed details", () => {
    expect(countedDetail("start_set", "gps")).toBe("gps");
    expect(countedDetail("share_sent", "0-2 min")).toBe("0-2 min");
    expect(countedDetail("nav_open", undefined)).toBe("");
  });

  it("counts gpx, on-trail, empty-list and plan time events", () => {
    expect(countedDetail("gpx_download", "")).toBe("");
    expect(countedDetail("on_trail", undefined)).toBe("");
    expect(countedDetail("list_empty", "")).toBe("");
    expect(countedDetail("plan_took", "0-2 min")).toBe("0-2 min");
    expect(countedDetail("plan_took", "an hour")).toBeNull();
  });

  it("counts the start methods, day picks and trip searches", () => {
    for (const how of ["suggestion", "typed", "town_button", "map_pick", "town_page", "gps", "remembered"]) expect(countedDetail("start_set", how)).toBe(how);
    expect(countedDetail("day_pick", "so")).toBe("so");
    expect(countedDetail("trip_search", "miss")).toBe("miss");
    expect(countedDetail("day_pick", "2026-11-14")).toBeNull();
  });

  it("counts trip pages opened, without the trail", () => {
    expect(countedDetail("trip_open", "")).toBe("");
    expect(countedDetail("trip_open", undefined)).toBe("");
  });

  it("drops anything else, so the table stays a few rows a month", () => {
    expect(countedDetail("trip_open", "krivan")).toBeNull();
    expect(countedDetail("trip_search_town", "")).toBeNull();
    expect(countedDetail("start_set", "Bratislava")).toBeNull();
    expect(countedDetail("toString", "")).toBeNull();
    expect(countedDetail(42, "")).toBeNull();
  });
});

describe("monthTotals", () => {
  const row = (month: string, name: string, detail: string, n: number) => ({ month, name, detail, n });

  it("sums a month's rows and keeps the splits", () => {
    const [nov, oct] = monthTotals([
      row("2026-11", "start_set", "gps", 5),
      row("2026-11", "start_set", "typed", 3),
      row("2026-11", "trip_open", "", 40),
      row("2026-11", "day_pick", "zajtra", 4),
      row("2026-11", "day_pick", "iny", 2),
      row("2026-11", "trip_search", "hit", 7),
      row("2026-11", "trip_search", "miss", 2),
      row("2026-11", "gpx_download", "", 1),
      row("2026-11", "on_trail", "", 2),
      row("2026-11", "plan_commit", "save", 3),
      row("2026-11", "plan_took", "0-2 min", 2),
      row("2026-11", "plan_took", "5-15 min", 1),
      row("2026-10", "start_set", "manual", 9),
    ]);
    expect(nov).toMatchObject({ month: "2026-11", starts: 8, startHow: { gps: 5, typed: 3 }, opened: 40, dayPick: { zajtra: 4, iny: 2 }, searchHit: 7, searchMiss: 2, gpx: 1, onTrail: 2, planned: 3, plannedTimed: 3, plannedFast: 2 });
    expect(oct).toMatchObject({ month: "2026-10", starts: 9, startHow: { manual: 9 }, opened: 0, dayPick: {}, searchHit: 0, searchMiss: 0 });
  });
});
