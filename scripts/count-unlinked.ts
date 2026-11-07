// How many main trips have no inbound HTML link from another place's page or a hub (C53, research 03 F5).
// A main trip counts as linked when the home page, a town page or ANOTHER place's trip page links it
// (a place's own routes link each other, which doesn't help a crawler find the place).
// Reads the same data the pages do, so the numbers are the live link graph as built from the data.
//   npm run count-unlinked
import { getTown, getTownTrips } from "@/lib/townTrips";
import { getAllTrails, getAllTrips } from "@/lib/tripFiles";
import { getTowns } from "@/lib/trips";
import { nearestMainTrips } from "@/lib/nearbyTrips";

const NEARBY_COUNT = 7;
const HOME_FIRST = 30;

const mains = await getAllTrips();
const isMain = new Set(mains.map((t) => t.slug));

// Home: the best known HOME_FIRST trips (app/page.tsx).
const hub = new Set((await getAllTrails()).slice(0, HOME_FIRST).map((t) => t.trail.slug));
// Town pages: every tile of every row.
for (const town of getTowns()) {
  if (!getTown(town.id)) continue;
  const data = await getTownTrips(town.id);
  for (const row of data?.rows ?? []) for (const tile of row.tiles) hub.add(tile.slug);
}
const before = mains.filter((t) => !hub.has(t.slug)).length;

// Trip pages: the neighbour block (components/NearbyTrips.tsx).
const linked = new Set(hub);
const inbound = new Map<string, number>();
for (const t of mains) {
  for (const n of nearestMainTrips(mains, t.destination.location, t.slug, NEARBY_COUNT)) {
    linked.add(n.trip.slug);
    inbound.set(n.trip.slug, (inbound.get(n.trip.slug) ?? 0) + 1);
  }
}
const after = mains.filter((t) => !linked.has(t.slug)).length;
const total = mains.length;
const pct = (n: number) => `${Math.round((n / total) * 100)} %`;
console.log(`main trips: ${total} (${isMain.size} slugs)`);
console.log(`linked from home + town pages: ${total - before}`);
console.log(`without an inbound link BEFORE the neighbour block: ${before} (${pct(before)})`);
console.log(`without an inbound link AFTER the neighbour block:  ${after} (${pct(after)})`);
console.log(`fewest inbound neighbour links on one trip: ${Math.min(...mains.map((t) => inbound.get(t.slug) ?? 0))}`);
