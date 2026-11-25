import { describe, expect, it } from "vitest";
import { addPlanVisit, planVisitId, removePlanVisit, visitsOfDoneTrips } from "@/lib/visits";
import type { VisitsData } from "@/lib/visits";
import type { SavedTrip } from "@/lib/savedTrips";

const empty: VisitsData = { visits: [], gone: {} };
const rysy = { slug: "rysy", name: "Rysy", date: "2026-08-01" };

describe("visits", () => {
  it("builds the same id on every device", () => {
    expect(planVisitId("rysy", "2026-08-01")).toBe("p:rysy:2026-08-01");
  });

  it("adds a plan visit once", () => {
    const one = addPlanVisit(empty, rysy, 100);
    expect(one.visits).toEqual([{ id: "p:rysy:2026-08-01", slug: "rysy", name: "Rysy", date: "2026-08-01", from: "plan", at: 100 }]);
    expect(addPlanVisit(one, rysy, 200)).toBe(one);
  });

  it("leaves a tombstone on unmark and a later mark is newer than it", () => {
    const one = addPlanVisit(empty, rysy, 100);
    const none = removePlanVisit(one, "rysy", "2026-08-01", 50);
    expect(none.visits).toEqual([]);
    expect(none.gone).toEqual({ "p:rysy:2026-08-01": 101 });
    expect(removePlanVisit(none, "rysy", "2026-08-01", 500)).toBe(none);
    const back = addPlanVisit(none, rysy, 60);
    expect(back.gone).toEqual({});
    expect(back.visits[0].at).toBe(102);
  });

  it("moves done trips once: running it again changes nothing", () => {
    const trips = [
      { ...rysy, savedAt: "x", doneAt: "2026-08-01T12:00:00.000Z" },
      { slug: "kriván", name: "Kriváň", date: "2026-08-05", savedAt: "x" },
    ] as SavedTrip[];
    const first = visitsOfDoneTrips(empty, trips, 999);
    expect(first.visits.map((v) => [v.id, v.at])).toEqual([["p:rysy:2026-08-01", Date.parse("2026-08-01T12:00:00.000Z")]]);
    expect(visitsOfDoneTrips(first, trips, 1234)).toBe(first);
  });
});
