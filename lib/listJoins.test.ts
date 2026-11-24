// The home list counts the same walk as the trip page (lib/walkFacts.ts). Without the trail paths
// it relies on the joins scripts/list-joins.ts stores in list.json; a pipeline build that skipped
// that step would bring back the old, longer home-list times.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { easierRoute, longerWalks, routeWalk, shorterRoutes, trailDetailFrom } from "@/lib/data";
import { summaryFromList } from "@/lib/trips";
import type { TripDetail, TripList } from "@/lib/tripSchema";

const DIR = join(process.cwd(), "public", "data", "trips");

describe("home list walks", () => {
  it("match the trip pages (run npm run list-joins after a pipeline build)", () => {
    const list = JSON.parse(readFileSync(join(DIR, "list.json"), "utf8")) as TripList;
    const off: string[] = [];
    for (const item of list.trips) {
      const trip = JSON.parse(readFileSync(join(DIR, `${item.slug}.json`), "utf8")) as TripDetail;
      const home = routeWalk(trailDetailFrom(summaryFromList(item)));
      const page = routeWalk(trailDetailFrom(trip));
      if (JSON.stringify(home) !== JSON.stringify(page)) off.push(item.slug);
    }
    expect(off.slice(0, 10), `${off.length} trips`).toEqual([]);
  });

  it("offer the shorter, longer and easier routes its own trip page counts (run npm run list-joins after a pipeline build)", () => {
    const list = JSON.parse(readFileSync(join(DIR, "list.json"), "utf8")) as TripList;
    const read = (slug: string) => JSON.parse(readFileSync(join(DIR, `${slug}.json`), "utf8")) as TripDetail;
    const off: string[] = [];
    for (const item of list.trips) {
      const trip = read(item.slug);
      const others = (trip.routes ?? []).filter((r) => r.slug !== item.slug).map((r) => trailDetailFrom(read(r.slug)));
      if (JSON.stringify(item.shorter) !== JSON.stringify(shorterRoutes(trailDetailFrom(trip), others))) off.push(item.slug);
      if (JSON.stringify(item.longer) !== JSON.stringify(longerWalks(trailDetailFrom(trip), others))) off.push(`${item.slug} (longer)`);
      if (JSON.stringify(item.easier) !== JSON.stringify(easierRoute(trailDetailFrom(trip), others))) off.push(`${item.slug} (easier)`);
    }
    expect(off.slice(0, 10), `${off.length} trips`).toEqual([]);
  });
});
