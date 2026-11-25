// The home list (public/data/trips/list.json) has no trail paths, so it can't work out where a
// parking or stop up the trail joins it, and its walking times came out longer than the trip
// page's (Velká Javorina: 1 h 45 on the list, 35 min on the page). This stores the trip page's
// join with the default parking and the default stop (lib/walkFacts.ts) in the list, and a
// clearly shorter route to the same place when there is one.
// Run after every pipeline build: npm run list-joins (lib/listJoins.test.ts checks it was).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { easierRoute, longerWalks, nearestStop, shorterRoutes, trailDetailFrom } from "@/lib/data";
import type { TrailJoin } from "@/lib/trailJoin";
import type { ListJoin, TripDetail, TripList } from "@/lib/tripSchema";

const DIR = join(process.cwd(), "public", "data", "trips");
const LIST = join(DIR, "list.json");

function stored(j: TrailJoin | null): ListJoin | undefined {
  if (!j) return undefined;
  const r = (x: number) => Number(x.toFixed(6));
  return { location: j.location, walk_m: j.walk_m, skip_out: r(j.skip_out), skip_back: r(j.skip_back), skip_m: j.skip_m, skip_ascent_m: j.skip_ascent_m };
}

const list = JSON.parse(readFileSync(LIST, "utf8")) as TripList;
const read = (slug: string) => JSON.parse(readFileSync(join(DIR, `${slug}.json`), "utf8")) as TripDetail;
let joins = 0;
let shorter = 0;
let easier = 0;
let longer = 0;
for (const item of list.trips) {
  const trip = read(item.slug);
  const detail = trailDetailFrom(trip);
  // A clearly shorter way to the same place, so a long main route doesn't hide it (Peter, 2026-10-23).
  const others = (trip.routes ?? []).filter((r) => r.slug !== item.slug).map((r) => trailDetailFrom(read(r.slug)));
  const short = shorterRoutes(detail, others);
  delete item.shorter;
  if (short) {
    item.shorter = short;
    shorter++;
  }
  // The clearly longer ways too, so a long-walk filter finds a place whose main route is short (Peter, 2026-11-24).
  const long = longerWalks(detail, others);
  delete item.longer;
  if (long) {
    item.longer = long;
    longer++;
  }
  // An easier route, so a "ľahká" filter still finds a place whose main route is harder (A13).
  const easy = easierRoute(detail, others);
  delete item.easier;
  if (easy) {
    item.easier = easy;
    easier++;
  }
  if (item.parking) {
    const j = stored(detail.parkingLots[0]?.join ?? null);
    item.parking = { ...item.parking, ...(j ? { join: j } : {}) };
    if (j) joins++;
  }
  // The trip page starts by bus from the stop with the shortest walk to the trail, not always the nearest to the start.
  const stop = nearestStop(detail);
  if (stop) {
    const i = Number(stop.id.split(":").pop());
    const raw = [trip.transit, ...trip.transit_alternatives].filter((s) => s != null)[i];
    const j = stored(stop.join);
    // Without the OSM id and the walk line, as publish.py lists stops.
    item.transit = { name: raw.name, mode: raw.mode, location: raw.location, walk_m: raw.walk_m, ...(j ? { join: j } : {}) } as TripList["trips"][number]["transit"];
    if (j) joins++;
  }
}
// Same layout as pipeline/publish.py writes it.
writeFileSync(LIST, JSON.stringify(list) + "\n");
console.log(`list.json: ${joins} joins, ${shorter} shorter, ${longer} longer and ${easier} easier routes for ${list.trips.length} trips`);
