import { describe, expect, it } from "vitest";
import { countedDetail } from "./eventCounts";

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

  it("drops anything else, so the table stays a few rows a month", () => {
    expect(countedDetail("trip_open", "")).toBeNull();
    expect(countedDetail("start_set", "Bratislava")).toBeNull();
    expect(countedDetail("toString", "")).toBeNull();
    expect(countedDetail(42, "")).toBeNull();
  });
});
