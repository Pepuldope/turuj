import { describe, expect, it } from "vitest";
import { closedLast } from "./homeOrder";
import type { Closure } from "./types";

const winter: Closure = { kind: "rocna", starts_on: "2026-11-01", ends_on: "2027-05-31" } as Closure;
const trip = (slug: string, closed: boolean) => ({ slug, closures: closed ? [winter] : [] });

describe("closedLast", () => {
  const trips = [trip("rysy", true), trip("a", false), trip("krivan", true), trip("b", false)];
  it("sinks trips closed today below open ones, keeping each group's order", () => {
    expect(closedLast(trips, "2026-11-14").map((t) => t.slug)).toEqual(["a", "b", "rysy", "krivan"]);
  });
  it("keeps the order when nothing is closed that day", () => {
    expect(closedLast(trips, "2026-07-14").map((t) => t.slug)).toEqual(["rysy", "a", "krivan", "b"]);
  });
  it("hides nothing", () => {
    expect(closedLast(trips, "2026-11-14")).toHaveLength(4);
  });
});
