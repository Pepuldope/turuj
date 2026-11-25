import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closureRulesFor, getClosureRules, getTowns, summaryFromList } from "@/lib/trips";
import { getAllTrips, getTownDrives, getTrip } from "@/lib/tripFiles";
import list from "@/public/data/trips/list.json";
import type { TripList, TripSummary } from "@/lib/tripSchema";
import { isClosureActive } from "@/lib/closures";

// Checks the static trip files the pipeline writes (docs/TRIP-DATA.md).
const trips = await getAllTrips();
// The other routes of each place: the database load reads them, the site never lists them.
const variants = (JSON.parse(readFileSync("data/trip-variants.json", "utf8")) as { trips: TripSummary[] }).trips;

describe("trip data", () => {
  it("has unique slugs, a detail file and a GPX file for every trip", async () => {
    expect(new Set(trips.map((t) => t.slug)).size).toBe(trips.length);
    for (const t of trips) {
      const d = await getTrip(t.slug);
      expect(d?.slug).toBe(t.slug);
      expect(d!.path.length).toBeGreaterThan(1);
      expect(existsSync(`public${t.gpx_url}`)).toBe(true);
    }
  });

  it("keeps the 10 hand-picked trips", () => {
    expect([...trips, ...variants].filter((t) => t.curated).length).toBe(10);
  });

  it("lists main routes only in the index, and every route of a place in each of its files", async () => {
    expect(trips.some((t) => t.variant_of)).toBe(false);
    const kamzik = await getTrip("kamzik");
    expect(kamzik?.routes?.[0].slug).toBe("kamzik");
    const other = await getTrip(kamzik!.routes![1].slug);
    expect(other?.variant_of).toBe("kamzik");
    expect(other?.routes).toEqual(kamzik?.routes);
  });

  it("only points at closure rules that exist and carry a source", () => {
    const ids = new Set(getClosureRules().map((r) => r.id));
    for (const t of trips) for (const id of t.closure_rule_ids) expect(ids.has(id)).toBe(true);
    for (const r of getClosureRules()) {
      expect(r.source_url).toMatch(/^https:\/\//);
      expect(r.verified_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("applies the TANAP closure in winter and not in summer", () => {
    const rule = { ...getClosureRules().find((r) => r.id === "tanap-sezonna-uzavera")!, trail_id: "test" };
    expect(isClosureActive(rule, "2027-01-15")).toBe(true);
    expect(isClosureActive(rule, "2027-05-31")).toBe(true);
    expect(isClosureActive(rule, "2027-06-01")).toBe(false);
    expect(closureRulesFor({ closure_rule_ids: [] })).toEqual([]);
  });

  it("has a drive time from every town to every place (its main route)", async () => {
    const towns = getTowns();
    if (towns.length === 0) return;
    const minutes = await getTownDrives(towns[0].id);
    expect(Object.keys(minutes).sort()).toEqual(trips.filter((t) => !t.variant_of).map((t) => t.slug).sort());
    expect(await getTownDrives("no-such-town")).toEqual({});
  });

  it("lists every trip for the home page, filling in what the list leaves out", () => {
    const listed = (list as unknown as TripList).trips;
    // One trip per place: other routes to it are only on its trip page.
    expect(listed.map((t) => t.slug)).toEqual(trips.filter((t) => !t.variant_of).map((t) => t.slug));
    const full = summaryFromList(listed[0]);
    expect(full.gpx_url).toBe(trips[0].gpx_url);
    expect({ ...full, description: "", marked_share: 1, curated: false, protected_area: null, max_ele_m: null }).toEqual({
      ...trips[0],
      description: "",
      marked_share: 1,
      curated: false,
      protected_area: null,
      max_ele_m: null,
      destination: { ...trips[0].destination, osm: null },
      start: { ...trips[0].start, osm: null },
      parking: trips[0].parking && { ...trips[0].parking, osm: null },
      transit: trips[0].transit && { ...trips[0].transit, osm: null },
      // Home list only (scripts/list-joins.ts).
      shorter: full.shorter,
      longer: full.longer,
    });
  });

  it("refuses slugs that could leave the data folder", async () => {
    expect(await getTrip("../index")).toBeNull();
  });
});
