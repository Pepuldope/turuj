import type { Map as MlMap } from "maplibre-gl";
import { dayMoment, dayPlace, onDayMoment } from "@/lib/dayClock";
import type { DayModel } from "@/lib/dayClock";
import { formatTime } from "@/lib/format";
import { haversineM, nearestOnPath } from "@/lib/geo";
import { UI_ICON } from "@/lib/uiIcons";
import type { LatLng } from "@/lib/types";

type MapLibre = typeof import("maplibre-gl");

/** The walker is put on the drawn line when its profile position is this close to it (the profile is a thinned copy of the path). */
const SNAP_M = 80;

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

  let lastKind = "";
  const place = () => {
    // Nothing scrubbed yet: where the dial's walker rests, at the goal.
    const t = dayMoment() ?? model.goalTime ?? model.hs;
    const at = dayPlace(model, t);
    let where: LatLng | null = null;
    let riding = false;
    if (at.kind === "ride") {
      where = route.ride;
      riding = true;
    } else if (at.kind === "approach") {
      where = alongLeg(at.back ? 1 - at.f : at.f) ?? route.ride ?? trailLL[0] ?? null;
    } else if (at.pos) {
      const raw = { lat: at.pos[0], lon: at.pos[1] };
      const hit = trailLL.length >= 2 ? nearestOnPath(trailLL, raw) : null;
      where = hit && hit.distanceM <= SNAP_M ? hit.point : raw;
    }
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
  return () => {
    off();
    if (frame) cancelAnimationFrame(frame);
    marker.remove();
  };
}
