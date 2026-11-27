import { describe, expect, it } from "vitest";
import type { SavedTrip } from "@/lib/savedTrips";
import { byYear, lastWalk, visitedPlaces } from "@/lib/visitedList";
import { planVisitId, visitedTrips, walkedRoutes } from "@/lib/visits";
import type { Visit } from "@/lib/visits";

const visit = (over: Partial<Visit>): Visit => ({ id: "m:1", slug: "krivan", route: "krivan", name: "Kriváň", date: "2026-11-21", from: "manual", at: 1, ...over });

describe("visitedPlaces", () => {
  it("puts the visits of one place in one row, the latest first", () => {
    const list = visitedPlaces([
      visit({ id: "a", date: "2025" }),
      visit({ id: "b", date: "2026-11-21", route: "krivan-tri-studnicky-stara" }),
      visit({ id: "c", slug: "rysy", route: "rysy/okruh", name: "Rysy", date: "2026-08-02" }),
    ]);
    expect(list.map((p) => p.key)).toEqual(["krivan", "rysy"]);
    expect(list[0].visits.map((v) => v.id)).toEqual(["b", "a"]);
    expect(list[0].year).toBe(2026);
  });

  it("lists a visit that has no place yet under its route's trip", () => {
    const list = visitedPlaces([visit({ id: "p", slug: "", route: "rysy/okruh", from: "plan" })]);
    expect(list.map((p) => p.key)).toEqual(["rysy"]);
  });

  it("orders the places by their latest visit, the ones with no date last", () => {
    const list = visitedPlaces([
      visit({ id: "a", slug: "sip", route: "sip", date: "" }),
      visit({ id: "b", slug: "kamzik", route: "kamzik", date: "2025-su" }),
      visit({ id: "c", date: "2026-11-21" }),
    ]);
    expect(list.map((p) => p.key)).toEqual(["krivan", "kamzik", "sip"]);
    expect(list.map((p) => p.year)).toEqual([2026, 2025, null]);
  });
});

describe("byYear", () => {
  it("makes a section per year, the newest first, and one for no date at the end", () => {
    const places = visitedPlaces([
      visit({ id: "a", slug: "sip", route: "sip", date: "" }),
      visit({ id: "b", slug: "kamzik", route: "kamzik", date: "2025-su" }),
      visit({ id: "c", date: "2026-11-21" }),
      visit({ id: "d", slug: "devin", route: "devin", date: "2026-03-01" }),
    ]);
    const sections = byYear(places);
    expect(sections.map((s) => s.year)).toEqual([2026, 2025, null]);
    expect(sections[0].places.map((p) => p.key)).toEqual(["krivan", "devin"]);
  });
});

describe("lastWalk", () => {
  const plan = { slug: "krivan-tri-studnicky-stara", route: "krivan-tri-studnicky-stara", date: "2026-11-21", name: "Kriváň" } as SavedTrip;

  it("takes the latest visit with a known route and the plan it came from", () => {
    const visits = [visit({ id: "x", route: "", date: "2026-11-25" }), visit({ id: planVisitId(plan.slug, plan.date), route: plan.slug, from: "plan" })];
    expect(lastWalk(visits, [plan])).toEqual({ route: plan.slug, plan, how: null });
  });

  it("has no plan for a visit ticked by hand, or once the plan was saved again for another day", () => {
    expect(lastWalk([visit({ id: "m:9", route: plan.slug })], [plan])).toEqual({ route: plan.slug, plan: null, how: null });
    const visits = [visit({ id: planVisitId(plan.slug, plan.date), route: plan.slug, from: "plan" })];
    expect(lastWalk(visits, [{ ...plan, date: "2026-12-05" }])?.plan).toBeNull();
  });

  it("carries the how kept with that visit", () => {
    const how = { travel: "car" as const, withKids: true };
    expect(lastWalk([visit({ id: "p:x:2026-11-21", route: "krivan", from: "plan", how })], [])).toEqual({ route: "krivan", plan: null, how });
  });

  it("is nothing when no visit says which route it was", () => {
    expect(lastWalk([visit({ route: "" })], [plan])).toBeNull();
  });
});

describe("marks", () => {
  const visits = [visit({ id: "a", route: "krivan-tri-studnicky-stara" }), visit({ id: "b", slug: "rysy", route: "rysy/okruh" }), visit({ id: "c", slug: "sip", route: "" })];

  it("marks the place and the trip of the route walked on cards and pins", () => {
    expect([...visitedTrips(visits)].sort()).toEqual(["krivan", "krivan-tri-studnicky-stara", "rysy", "sip"]);
  });

  it("marks only the routes walked in step 1", () => {
    expect([...walkedRoutes(visits)].sort()).toEqual(["krivan-tri-studnicky-stara", "rysy/okruh"]);
  });
});
