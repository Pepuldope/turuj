import type { Map as MlMap } from "maplibre-gl";
import { dayMoment, dayPlace, onDayMoment } from "@/lib/dayClock";
import type { DayModel } from "@/lib/dayClock";
import { formatDurationShort, formatTime } from "@/lib/format";
import { haversineM, nearestOnPath } from "@/lib/geo";
import { UI_ICON } from "@/lib/uiIcons";
import type { LatLng } from "@/lib/types";

type MapLibre = typeof import("maplibre-gl");

/** The walker is put on the drawn line when its profile position is this close to it (the profile is a thinned copy of the path). */
const SNAP_M = 80;
/** The sun dial's ink: the car bar there, the drive line here. */
const INK = "#14233b";
const DRIVE_SRC = "day-drive";

const icon = (svg: string) => `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">${svg}</svg>`;
const RIDE_ICON = { car: UI_ICON.car, bus: UI_ICON.bus, train: UI_ICON.train, foot: UI_ICON.walker } as const;

/**
 * The walker on the day map: a blue round marker (the car or bus while you ride, off the trail) with a
 * time pill, moved to wherever the sun dial's moment puts you (lib/dayClock.ts dayPlace, the same
 * profile positions the dial's own walker uses). It moves at most once per frame and is set, never
 * tweened, so reduced motion needs nothing more. Returns the function that removes it.
 */
export function attachDayWalker(
  ml: MapLibre,
  map: MlMap,
  model: DayModel,
  route: {
    /** The drawn trail, [lat, lon]. */
    trail: [number, number][];
    /** The walk from where the car stops to the trail, [lat, lon]. */
    approach: [number, number][] | undefined;
    /** Where the ride ends: the parking or the stop. */
    ride: LatLng | null;
    /** The ride from the start to `ride` along the roads, [lat, lon]: drawn on the map, runs off its edge, the car rides along it. */
    drive?: [number, number][];
  }
): () => void {
  const el = document.createElement("div");
  el.className = "mt-walker";
  const glyph = document.createElement("span");
  glyph.className = "mt-walker-dot";
  const pill = document.createElement("span");
  pill.className = "mt-walker-time font-data";
  el.append(glyph, pill);
  el.setAttribute("role", "img");
  const marker = new ml.Marker({ element: el, anchor: "center" });
  let shown = true;

  const trailLL = route.trail.map(([lat, lon]) => ({ lat, lon }));
  const leg = route.approach?.map(([lat, lon]) => ({ lat, lon })) ?? [];
  const legAt: number[] = [0];
  for (let i = 1; i < leg.length; i++) legAt.push(legAt[i - 1] + haversineM(leg[i - 1], leg[i]));
  const alongLeg = (f: number): LatLng | null => {
    if (leg.length < 2) return null;
    const want = f * legAt[legAt.length - 1];
    let i = 1;
    while (i < legAt.length - 1 && legAt[i] < want) i++;
    const g = (want - legAt[i - 1]) / (legAt[i] - legAt[i - 1] || 1);
    return { lat: leg[i - 1].lat + (leg[i].lat - leg[i - 1].lat) * g, lon: leg[i - 1].lon + (leg[i].lon - leg[i - 1].lon) * g };
  };

  // The drive: a dark line with white dashes under the trail (the sun dial's car bar), a label where it leaves the map,
  // and the car on it while the dial is in a ride.
  const ride = model.ride && route.drive && route.drive.length >= 2 ? model.ride : null;
  const line = ride ? route.drive! : [];
  const lineAt: number[] = [0];
  for (let i = 1; i < line.length; i++) lineAt.push(lineAt[i - 1] + haversineM({ lat: line[i - 1][0], lon: line[i - 1][1] }, { lat: line[i][0], lon: line[i][1] }));
  const lineLen = lineAt[lineAt.length - 1] || 1;
  let drawn = false;
  if (ride) {
    const geo: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map(([lat, lon]) => [lon, lat]) } };
    const before = map.getLayer("track-casing") ? "track-casing" : undefined;
    map.addSource(DRIVE_SRC, { type: "geojson", data: geo });
    map.addLayer({ id: `${DRIVE_SRC}-ink`, type: "line", source: DRIVE_SRC, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": INK, "line-width": 5 } }, before);
    map.addLayer({ id: `${DRIVE_SRC}-dash`, type: "line", source: DRIVE_SRC, layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 1.6, "line-dasharray": [1.6, 2.4] } }, before);
    drawn = true;
  }
  const rideMin = ride ? Math.round(((ride.there ? ride.there.to - ride.there.from : ride.back!.to - ride.back!.from) / 60000) || 0) : 0;
  // A zero-size anchor on the line; the box inside leans away from the map edge it is pinned to (globals.css .mt-driveend).
  const tag = document.createElement("div");
  tag.className = "mt-driveend";
  tag.setAttribute("aria-hidden", "true");
  const box = document.createElement("span");
  box.className = "mt-driveend-box";
  tag.append(box);
  const tagArrow = document.createElement("span");
  tagArrow.className = "mt-driveend-arrow";
  tagArrow.innerHTML = icon(UI_ICON.back);
  const tagText = document.createElement("span");
  if (ride) {
    const vehicle = document.createElement("span");
    vehicle.innerHTML = icon(RIDE_ICON[model.mode]);
    const name = document.createElement("span");
    name.className = "mt-driveend-name";
    name.textContent = `${ride.name} \u00b7 `;
    const dur = document.createElement("span");
    dur.className = "font-data";
    dur.textContent = formatDurationShort(rideMin);
    tagText.append(name, dur);
    box.append(tagArrow, vehicle, tagText);
  }
  const tagMarker = new ml.Marker({ element: tag, anchor: "center" });
  let tagShown = false;

  /** Where the line leaves the visible map for good (its last crossing of the edge, `inset` px inside it), on the way to the parking. */
  const exitPoint = (inset: number) => {
    const c = map.getContainer();
    const [w, h] = [c.clientWidth, c.clientHeight];
    const px = line.map(([lat, lon]) => map.project([lon, lat]));
    const inside = (p: { x: number; y: number }) => p.x >= inset && p.x <= w - inset && p.y >= inset && p.y <= h - inset;
    let i = px.length - 1;
    while (i >= 0 && inside(px[i])) i--;
    if (i === px.length - 1) return { whole: false as const, none: true as const };
    if (i < 0) return { whole: true as const, none: false as const };
    const a = px[i + 1];
    const b = px[i];
    // From the inside point a towards the outside point b: the first bound it reaches.
    let s = 1;
    let edge = "left" as "left" | "right" | "top" | "bottom";
    const hit = (bound: number, from: number, to: number, e: typeof edge) => {
      if (to === from) return;
      const k = (bound - from) / (to - from);
      if (k >= 0 && k < s) {
        s = k;
        edge = e;
      }
    };
    if (b.x < inset) hit(inset, a.x, b.x, "left");
    if (b.x > w - inset) hit(w - inset, a.x, b.x, "right");
    if (b.y < inset) hit(inset, a.y, b.y, "top");
    if (b.y > h - inset) hit(h - inset, a.y, b.y, "bottom");
    const x = a.x + (b.x - a.x) * s;
    const y = a.y + (b.y - a.y) * s;
    const segM = lineAt[i + 1] - lineAt[i];
    return { whole: false as const, none: false as const, x, y, edge, angle: Math.atan2(b.y - a.y, b.x - a.x), along: lineAt[i + 1] - segM * s };
  };
  const alongLine = (d: number): LatLng => {
    let i = 1;
    while (i < lineAt.length - 1 && lineAt[i] < d) i++;
    const g = Math.max(0, Math.min(1, (d - lineAt[i - 1]) / (lineAt[i] - lineAt[i - 1] || 1)));
    return { lat: line[i - 1][0] + (line[i][0] - line[i - 1][0]) * g, lon: line[i - 1][1] + (line[i][1] - line[i - 1][1]) * g };
  };
  /** The car at moment t on the drive: its distance from the start along the line, or null when t is not in a ride. */
  const carAlong = (t: number): number | null => {
    if (!ride) return null;
    const f = (r: { from: number; to: number }, x: number) => Math.max(0, Math.min(1, (x - r.from) / (r.to - r.from || 1)));
    if (t < model.hs) return ride.there ? f(ride.there, t) * lineLen : null;
    if (t > model.he) return ride.back ? (1 - f(ride.back, t)) * lineLen : null;
    return null;
  };
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const hits = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  /** The car's footprint on screen: the round marker and its time pill above (or below) it. */
  const carBox = (c: { x: number; y: number; pillBelow: boolean }): Box => ({ x0: c.x - 18, x1: c.x + 70, y0: c.pillBelow ? c.y - 16 : c.y - 48, y1: c.pillBelow ? c.y + 48 : c.y + 16 });
  /**
   * The label sits at the edge point where the road leaves the map, inside the edge, and slides along that edge
   * until it clears the car, the pins and their labels and the trail.
   */
  const placeTag = (car: { x: number; y: number; pillBelow: boolean } | null) => {
    if (!ride) return;
    const e = exitPoint(6);
    if (e.none) {
      if (tagShown) tag.style.display = "none";
      tagShown = false;
      return;
    }
    if (!tagShown) tag.style.display = "";
    tagShown = true;
    if (e.whole) {
      // The whole ride is on the map: the label sits at its start, no arrow.
      tagArrow.style.display = "none";
      tagMarker.setOffset([0, 0]).setLngLat([line[0][1], line[0][0]]);
      tag.dataset.edge = "start";
      return;
    }
    tagArrow.style.display = "";
    tagArrow.style.transform = `rotate(${(e.angle * 180) / Math.PI - 180}deg)`;
    tag.dataset.edge = e.edge;
    const c = map.getContainer();
    const [w, h] = [c.clientWidth, c.clientHeight];
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    const along = e.edge === "top" || e.edge === "bottom" ? "x" : "y";
    const at = (slide: number): Box => {
      const x = e.x + (along === "x" ? slide : 0);
      const y = e.y + (along === "y" ? slide : 0);
      if (e.edge === "bottom") return { x0: x - bw / 2, x1: x + bw / 2, y0: y - bh, y1: y };
      if (e.edge === "top") return { x0: x - bw / 2, x1: x + bw / 2, y0: y, y1: y + bh };
      if (e.edge === "left") return { x0: x, x1: x + bw, y0: y - bh / 2, y1: y + bh / 2 };
      return { x0: x - bw, x1: x, y0: y - bh / 2, y1: y + bh / 2 };
    };
    // Obstacles: pins and their labels (any other marker), the car, and the drawn trail.
    const cr = c.getBoundingClientRect();
    const obstacles: Box[] = [];
    for (const m of c.querySelectorAll<HTMLElement>(".maplibregl-marker")) {
      if (m === tag || m === el) continue;
      const r = m.getBoundingClientRect();
      obstacles.push({ x0: r.left - cr.left - 2, x1: r.right - cr.left + 2, y0: r.top - cr.top - 2, y1: r.bottom - cr.top + 2 });
    }
    if (car) obstacles.push(carBox(car));
    const free = (b: Box) => {
      if (b.x0 < 2 || b.y0 < 2 || b.x1 > w - 2 || b.y1 > h - 2) return false;
      if (obstacles.some((o) => hits(b, o))) return false;
      return map.getLayer("track-line") ? map.queryRenderedFeatures([[b.x0, b.y0], [b.x1, b.y1]], { layers: ["track-line"] }).length === 0 : true;
    };
    // Slide towards the middle of the edge first, then the other way.
    const mid = along === "x" ? w / 2 : h / 2;
    const dir = (along === "x" ? e.x : e.y) <= mid ? 1 : -1;
    let slide = 0;
    for (let k = 0; k <= 16; k++) {
      const tries = k === 0 ? [0] : [dir * k * 16, -dir * k * 16];
      const ok = tries.find((sl) => free(at(sl)));
      if (ok !== undefined) {
        slide = ok;
        break;
      }
    }
    // Nothing is free: stay at the edge point, inside the map.
    const b0 = at(slide);
    if (slide === 0 && !free(b0)) {
      const over = along === "x" ? Math.max(2 - b0.x0, Math.min(0, w - 2 - b0.x1)) : Math.max(2 - b0.y0, Math.min(0, h - 2 - b0.y1));
      slide = over;
    }
    tagMarker.setOffset(along === "x" ? [slide, 0] : [0, slide]).setLngLat(map.unproject([e.x, e.y]));
  };

  /** A point on the drive at least `px` screen pixels before the parking, so the car doesn't sit on the P pin and its labels. */
  const beforeParking = (px: number): LatLng | null => {
    const pts = line.map(([lat, lon]) => map.project([lon, lat]));
    const pp = pts[pts.length - 1];
    for (let i = pts.length - 2; i >= 0; i--) {
      const dd = Math.hypot(pts[i].x - pp.x, pts[i].y - pp.y);
      if (dd >= px) {
        const dn = Math.hypot(pts[i + 1].x - pp.x, pts[i + 1].y - pp.y);
        const g = (px - dn) / (dd - dn || 1);
        return { lat: line[i + 1][0] + (line[i][0] - line[i + 1][0]) * g, lon: line[i + 1][1] + (line[i][1] - line[i + 1][1]) * g };
      }
    }
    return null;
  };
  const NEAR_P_PX = 40;
  /** The car is shown only this far inside the map's edge, so it is never half cut off by it. */
  const EDGE_PX = 14;

  let lastKind = "";
  const place = () => {
    // Nothing scrubbed yet: where the dial's walker rests, at the goal.
    const t = dayMoment() ?? model.goalTime ?? model.hs;
    const at = dayPlace(model, t);
    let where: LatLng | null = null;
    let riding = false;
    let pillBelow = false;
    if (at.kind === "ride") {
      riding = true;
      const d = carAlong(t);
      if (d === null) {
        where = route.ride;
      } else {
        where = alongLine(d);
        // Off the map the car is not drawn at all (it used to wait at the edge, on the drive's label): it shows once its point is in view.
        const p = map.project([where.lon, where.lat]);
        const c = map.getContainer();
        if (p.x < EDGE_PX || p.x > c.clientWidth - EDGE_PX || p.y < EDGE_PX || p.y > c.clientHeight - EDGE_PX) where = null;
        else {
          // At the parking (or nearly): beside the P pin on the road, its time under it, never on the pin and its labels.
          const pp = map.project([line[line.length - 1][1], line[line.length - 1][0]]);
          if (Math.hypot(p.x - pp.x, p.y - pp.y) < NEAR_P_PX) {
            where = beforeParking(NEAR_P_PX) ?? where;
            pillBelow = true;
          }
        }
      }
    } else if (at.kind === "approach") {
      where = alongLeg(at.back ? 1 - at.f : at.f) ?? route.ride ?? trailLL[0] ?? null;
    } else if (at.pos) {
      const raw = { lat: at.pos[0], lon: at.pos[1] };
      const hit = trailLL.length >= 2 ? nearestOnPath(trailLL, raw) : null;
      where = hit && hit.distanceM <= SNAP_M ? hit.point : raw;
    }
    // The ride's end can also lie outside a map the visitor moved: the car is hidden then, too.
    if (riding && where) {
      const q = map.project([where.lon, where.lat]);
      const c = map.getContainer();
      if (q.x < 0 || q.x > c.clientWidth || q.y < 0 || q.y > c.clientHeight) where = null;
    }
    el.classList.toggle("is-below", pillBelow);
    if (where) {
      const pc = map.project([where.lon, where.lat]);
      placeTag({ x: pc.x, y: pc.y, pillBelow });
    } else placeTag(null);
    if (!where) {
      if (shown) el.style.display = "none";
      shown = false;
      return;
    }
    if (!shown) el.style.display = "";
    shown = true;
    marker.setLngLat([where.lon, where.lat]);
    // The car (or bus, train) where the ride ends before and after the walk, the walker everywhere else.
    const kind = riding && model.mode !== "foot" ? model.mode : "foot";
    if (kind !== lastKind) {
      glyph.innerHTML = icon(RIDE_ICON[kind]);
      lastKind = kind;
    }
    const time = formatTime(new Date(t));
    pill.textContent = time;
    el.setAttribute("aria-label", time);
  };

  marker.setLngLat([0, 0]).addTo(map);
  if (ride) tagMarker.setLngLat([0, 0]).addTo(map);
  place();
  let frame = 0;
  const off = onDayMoment(() => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    }
  });
  // The label and the car follow the map's edge, so they are placed again when it moves or is resized.
  const again = () => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    }
  };
  map.on("move", again);
  map.on("resize", again);
  return () => {
    off();
    map.off("move", again);
    map.off("resize", again);
    if (ride) {
      tagMarker.remove();
      if (drawn) {
        for (const id of [`${DRIVE_SRC}-dash`, `${DRIVE_SRC}-ink`]) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(DRIVE_SRC)) map.removeSource(DRIVE_SRC);
      }
    }
    if (frame) cancelAnimationFrame(frame);
    marker.remove();
  };
}
