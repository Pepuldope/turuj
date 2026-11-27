import { beforeEach, describe, expect, it, vi } from "vitest";
import { addHandVisit, addPlanVisit, changeVisit, howOf, markVisited, planVisitId, readVisits, removePlanVisit, removeVisit, routeTrip, unmarkVisited, visitsAt, visitsOfDoneTrips, withHow, withPlace } from "@/lib/visits";
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


describe("how it went", () => {
  const start = { lat: 48.148598, lon: 17.107748, label: "Bratislava" };
  const stop = { id: "rysy:poi:1", name: "Chata", min: 40 };

  it("keeps start (to about 100 m), travel, kids and stops, and nothing when there is none of it", () => {
    expect(howOf({ start, travel: "transit", withKids: false, stops: [stop] })).toEqual({ start: { lat: 48.149, lon: 17.108, label: "Bratislava" }, travel: "transit", withKids: false, stops: [stop] });
    expect(howOf({ start: null, travel: "car" })).toEqual({ travel: "car" });
    expect(howOf({ start: null, stops: [] })).toBeUndefined();
    expect(howOf({})).toBeUndefined();
  });

  it("is carried by a plan visit, and not by one ticked by hand", () => {
    const data = addPlanVisit(empty, { ...rysy, start, travel: "car", withKids: true, stops: [stop] }, 100);
    expect(data.visits[0].how).toEqual({ start: { lat: 48.149, lon: 17.108, label: "Bratislava" }, travel: "car", withKids: true, stops: [stop] });
    expect(addPlanVisit(empty, rysy, 100).visits[0]).not.toHaveProperty("how");
    expect(addHandVisit(empty, { slug: "rysy", route: "rysy", name: "Rysy", date: "2026-08-01" }, "m:1", 5).visits[0]).not.toHaveProperty("how");
  });

  it("drops only the stops when the route changes, and keeps all of it when only the day does", () => {
    const data = addPlanVisit(empty, { ...rysy, start, travel: "car", stops: [stop] }, 100);
    const id = data.visits[0].id;
    expect(changeVisit(data, id, { date: "2026-08-02" }, 200).visits[0].how).toEqual(data.visits[0].how);
    const moved = changeVisit(data, id, { route: "rysy/okruh" }, 200).visits[0];
    expect(moved.how).toEqual({ start: { lat: 48.149, lon: 17.108, label: "Bratislava" }, travel: "car" });
    const onlyStops = addPlanVisit(empty, { ...rysy, stops: [stop] }, 100);
    expect(changeVisit(onlyStops, onlyStops.visits[0].id, { route: "rysy/okruh" }, 200).visits[0]).not.toHaveProperty("how");
  });

  describe("withHow", () => {
    const plain = addPlanVisit(empty, rysy, 100);
    const trip = { ...rysy, start, travel: "car", route: "rysy", time: "08:00" } as unknown as SavedTrip;

    it("fills it from the plan that is still here, newer than the visit", () => {
      const out = withHow(plain, [trip], 50);
      expect(out.visits[0].how).toEqual({ start: { lat: 48.149, lon: 17.108, label: "Bratislava" }, travel: "car" });
      expect(out.visits[0].at).toBe(101);
      expect(withHow(plain, [trip], 900).visits[0].at).toBe(900);
    });

    it("lowers the stamp by one when there is no plan to fill it from", () => {
      expect(withHow(plain, [], 900).visits[0].at).toBe(99);
      expect(withHow(plain, [{ ...trip, start: null, travel: undefined } as SavedTrip], 900).visits[0].at).toBe(99);
      const one = addPlanVisit(empty, rysy, 1);
      expect(withHow(one, [], 900).visits[0].at).toBe(1);
    });

    it("leaves visits by hand and visits that have it, and returns the same object when nothing is to do", () => {
      const hand = addHandVisit(empty, { slug: "rysy", route: "rysy", name: "Rysy", date: "" }, "m:1", 5);
      expect(withHow(hand, [trip], 900)).toBe(hand);
      const has = addPlanVisit(empty, { ...rysy, travel: "car" }, 100);
      expect(withHow(has, [trip], 900)).toBe(has);
      expect(withHow(empty, [trip], 900)).toBe(empty);
    });
  });
});
