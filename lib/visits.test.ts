import { beforeEach, describe, expect, it, vi } from "vitest";
import { addHandVisit, addPlanVisit, changeVisit, markVisited, planVisitId, readVisits, removePlanVisit, removeVisit, routeTrip, unmarkVisited, visitsAt, visitsOfDoneTrips, withPlace } from "@/lib/visits";
import type { VisitsData } from "@/lib/visits";
import type { SavedTrip } from "@/lib/savedTrips";

const empty: VisitsData = { visits: [], gone: {} };
const rysy = { slug: "rysy", name: "Rysy", date: "2026-08-01" };
const loop = { ...rysy, place: "rysy", route: "rysy/okruh" };

describe("visits", () => {
  it("builds the same id on every device", () => {
    expect(planVisitId("rysy", "2026-08-01")).toBe("p:rysy:2026-08-01");
  });

  it("adds a plan visit once", () => {
    const one = addPlanVisit(empty, rysy, 100);
    expect(one.visits).toEqual([{ id: "p:rysy:2026-08-01", slug: "", route: "rysy", name: "Rysy", date: "2026-08-01", from: "plan", at: 100 }]);
    expect(addPlanVisit(one, rysy, 200)).toBe(one);
  });

  it("leaves a tombstone on unmark and a later mark is newer than it", () => {
    const one = addPlanVisit(empty, rysy, 100);
    const none = removePlanVisit(one, rysy, 50);
    expect(none.visits).toEqual([]);
    expect(none.gone).toEqual({ "p:rysy:2026-08-01": 101 });
    expect(removePlanVisit(none, rysy, 500)).toBe(none);
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

describe("marking a visit on this device", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    vi.stubGlobal("window", { dispatchEvent: () => true });
  });

  it("keeps the place and the route of a plan made on the loop page", () => {
    markVisited(loop);
    expect(readVisits().map((v) => [v.id, v.slug, v.route, v.date])).toEqual([["p:rysy/okruh:2026-08-01", "rysy", "rysy/okruh", "2026-08-01"]]);
  });

  it("takes the slug as the route and no place for a plan saved before visits existed", () => {
    markVisited(rysy);
    expect(readVisits().map((v) => [v.id, v.slug, v.route])).toEqual([["p:rysy:2026-08-01", "", "rysy"]]);
  });

  it("removes the visit of the same plan again", () => {
    markVisited(loop);
    unmarkVisited(loop);
    expect(readVisits()).toEqual([]);
  });
});

describe("visits by hand, fixed and removed", () => {
  const devin = { slug: "hrad-devin", route: "hrad-devin", name: "Hrad Devín", date: "2026-11-21" };

  it("keeps two visits of one day apart", () => {
    const one = addHandVisit(empty, devin, "m:a", 100);
    const two = addHandVisit(one, devin, "m:b", 200);
    expect(two.visits.map((v) => v.id)).toEqual(["m:b", "m:a"]);
    expect(two.visits[0]).toEqual({ id: "m:b", ...devin, from: "manual", at: 200 });
    expect(addHandVisit(two, devin, "m:a", 300)).toBe(two);
  });

  it("records the day the group confirmed, under the plan's own id", () => {
    const one = addPlanVisit(empty, rysy, 100, "2026-08-02");
    expect(one.visits[0]).toMatchObject({ id: "p:rysy:2026-08-01", date: "2026-08-02" });
    // The plan still finds its visit, so unmarking it in Moje výlety removes it.
    expect(removePlanVisit(one, rysy, 200).visits).toEqual([]);
  });

  it("a fix is newer than what it replaces, and no change is no write", () => {
    const one = addHandVisit(empty, devin, "m:a", 100);
    expect(changeVisit(one, "m:a", { date: "2026-11-21" }, 500)).toBe(one);
    expect(changeVisit(one, "m:x", { date: "2025" }, 500)).toBe(one);
    const fixed = changeVisit(one, "m:a", { date: "2025-su" }, 50);
    expect(fixed.visits[0]).toMatchObject({ date: "2025-su", at: 101 });
  });

  it("a removal leaves a tombstone", () => {
    const one = addHandVisit(empty, devin, "m:a", 100);
    const none = removeVisit(one, "m:a", 50);
    expect(none).toEqual({ visits: [], gone: { "m:a": 101 } });
    expect(removeVisit(none, "m:a", 900)).toBe(none);
  });

  it("finds a place's visits, the latest first, also those that have no place yet", () => {
    expect(routeTrip("rysy/okruh")).toBe("rysy");
    expect(routeTrip("rysy")).toBe("rysy");
    let data = addHandVisit(empty, { slug: "krivan", route: "krivan-z-juhu", name: "Kriváň", date: "2024-su" }, "m:a", 1);
    data = addHandVisit(data, { slug: "krivan", route: "krivan", name: "Kriváň", date: "2026-08-15" }, "m:b", 2);
    data = addPlanVisit(data, { slug: "krivan-z-juhu", name: "Kriváň", date: "2025-07-01" }, 3); // no place
    data = addHandVisit(data, devin, "m:c", 4);
    expect(visitsAt(data.visits, "krivan", ["krivan", "krivan-z-juhu"]).map((v) => v.date)).toEqual(["2026-08-15", "2025-07-01", "2024-su"]);
    expect(visitsAt(data.visits, "hrad-devin", ["hrad-devin"]).map((v) => v.id)).toEqual(["m:c"]);
  });

  it("gives the place to visits that have none, once", () => {
    const old = addPlanVisit(empty, { slug: "rysy", name: "Rysy", date: "2026-08-01", route: "rysy/okruh" }, 100);
    const filled = withPlace(old, "rysy", ["rysy"], 50);
    expect(filled.visits[0]).toMatchObject({ slug: "rysy", at: 101 });
    expect(withPlace(filled, "rysy", ["rysy"], 900)).toBe(filled);
    expect(withPlace(old, "krivan", ["krivan"], 900)).toBe(old);
  });
});

