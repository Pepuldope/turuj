// Small photo per trip for the home cards (npm runs it in "prebuild"): the trip
// list carries no OSM ids, so this joins public/data/photos.json (by place) with
// the trip index (slug -> place) into public/data/photo-thumbs.json, slug -> a
// 250 px Commons thumbnail (one of Commons' standard steps, half the trip page's),
// and public/data/photo-keys.json for the trip page.
import { readFileSync, writeFileSync } from "node:fs";

const read = (f) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return null;
  }
};
const photos = read("public/data/photos.json")?.photos ?? {};
const trips = read("public/data/trips/index.json")?.trips ?? [];
const thumbs = {};
// The trip page's own file may not carry the OSM id, and it must not read the whole index:
// a small slug -> photos.json key map for the trips that have a photo.
const keys = {};
for (const t of trips) {
  const key = t.destination?.osm ?? `trip/${t.slug}`;
  const p = photos[key];
  if (!p) continue;
  thumbs[t.slug] = (p.src ?? p.url).replace("/500px-", "/250px-") // 250 px stays on Commons (C196: file limit);
  keys[t.slug] = key;
}
writeFileSync("public/data/photo-thumbs.json", JSON.stringify(thumbs));
writeFileSync("public/data/photo-keys.json", JSON.stringify(keys));
console.log(`Card photos: ${Object.keys(thumbs).length} of ${trips.length} trips`);
