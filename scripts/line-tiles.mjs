// The trail network's country view as ready-cut map tiles (npm runs it in "prebuild";
// Peter 2026-11-03, "the hitch with the trails"). Handed over as one GeoJSON file, the
// ~90,000 overview points were copied to the map's worker on the phone's main thread:
// about half a second of frozen page on a mid-range phone, right when the map appeared.
// As tiles, the map's worker fetches and reads them itself, and only the few tiles on
// screen, already thinned for their zoom.
//
// In: public/data/trails/overview.json (packed lines, pipeline/network.py).
// Out: public/data/trails/t/{z}/{x}/{y}.pbf, layer "network", property p (popularity
// level), zooms TILE_MIN..TILE_MAX; lib/trailNetwork.ts reads them. Not in git (built).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";

/** Keep in step with lib/trailNetwork.ts (NETWORK_TILE_MIN / NETWORK_TILE_MAX). */
export const TILE_MIN = 4;
export const TILE_MAX = 10;
export const LAYER = "network";

const SRC = "public/data/trails/overview.json";
const OUT = "public/data/trails/t";

/** Same as lib/packedLines.ts unpackLines. */
function unpack({ scale, props, lines }) {
  const keys = Object.keys(props);
  return {
    type: "FeatureCollection",
    features: lines.map((flat, i) => {
      const coordinates = [];
      let x = 0;
      let y = 0;
      for (let j = 0; j < flat.length; j += 2) {
        x += flat[j];
        y += flat[j + 1];
        coordinates.push([x / scale, y / scale]);
      }
      const properties = {};
      for (const k of keys) properties[k] = props[k][i];
      return { type: "Feature", properties, geometry: { type: "LineString", coordinates } };
    }),
  };
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

export function bounds(fc) {
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const f of fc.features)
    for (const [x, y] of f.geometry.coordinates) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  return [w, s, e, n];
}

function main() {
  const fc = unpack(JSON.parse(readFileSync(SRC, "utf8")));
  const index = new GeoJSONVT(fc, { maxZoom: TILE_MAX, indexMaxZoom: TILE_MAX, tolerance: 3, extent: 4096, buffer: 64 });
  const [w, s, e, n] = bounds(fc);
  rmSync(OUT, { recursive: true, force: true });
  let files = 0;
  let bytes = 0;
  for (let z = TILE_MIN; z <= TILE_MAX; z++) {
    for (let x = lon2x(w, z); x <= lon2x(e, z); x++) {
      for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
        // Every tile in the box gets a file, an empty one too: a missing tile would be an error in the map.
        const tile = index.getTile(z, x, y) ?? { features: [] };
        const buf = fromGeojsonVt({ [LAYER]: tile }, { version: 2, extent: 4096 });
        mkdirSync(`${OUT}/${z}/${x}`, { recursive: true });
        writeFileSync(`${OUT}/${z}/${x}/${y}.pbf`, buf);
        files++;
        bytes += buf.length;
      }
    }
  }
  console.log(`line-tiles: ${files} tiles, ${(bytes / 1024).toFixed(0)} KB, box ${[w, s, e, n].map((v) => v.toFixed(3)).join(",")}`);
}

main();
