import { describe, expect, it } from "vitest";
import { myTripsCounts, myTripsParts } from "@/lib/myTripsCount";
import type { Visit } from "@/lib/visits";

const visit = (slug: string, date: string): Visit => ({ id: `${slug}-${date}`, slug, route: slug, name: slug, date, from: "manual", at: 1 });

describe("myTripsCounts", () => {
  it("counts saved trips not done as planned and visited places, not visits", () => {
    const trips = [{}, {}, { doneAt: "2026-11-01T10:00:00Z" }];
    const visits = [visit("a", "2026-10-01"), visit("a", "2026-10-20"), visit("b", "2026-10-02")];
    expect(myTripsCounts(trips, visits)).toEqual({ planned: 2, visited: 2 });
  });
  it("is zero for a newcomer", () => {
    expect(myTripsCounts([], [])).toEqual({ planned: 0, visited: 0 });
  });
});

describe("myTripsParts", () => {
  it("uses the Slovak plural forms at 1, 2 and 5", () => {
    expect(myTripsParts({ planned: 1, visited: 1 }).map((p) => p.word)).toEqual(["plánovaný", "navštívený"]);
    expect(myTripsParts({ planned: 2, visited: 2 }).map((p) => p.word)).toEqual(["plánované", "navštívené"]);
    expect(myTripsParts({ planned: 5, visited: 5 }).map((p) => p.word)).toEqual(["plánovaných", "navštívených"]);
  });
  it("leaves a zero part out", () => {
    expect(myTripsParts({ planned: 0, visited: 5 })).toEqual([{ n: 5, word: "navštívených" }]);
    expect(myTripsParts({ planned: 2, visited: 0 })).toEqual([{ n: 2, word: "plánované" }]);
    expect(myTripsParts({ planned: 0, visited: 0 })).toEqual([]);
  });
});
