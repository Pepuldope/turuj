// Server-side routing calls shared by /api/drive and /api/walk.
//
// OpenRouteService when ORS_API_KEY is set (production; the key stays on the
// server). Without a key, the public OSRM demo (car) and FOSSGIS (foot)
// servers, which are fine for local development but have no SLA.
import type { DriveRoute } from "@/lib/drive";
import { haversineM, nearestOnPath } from "@/lib/geo";
import { spendOrsCall } from "@/lib/orsBudget";

export type Pt = [number, number];
type OrsProfile = "driving-car" | "foot-hiking" | "foot-walking";

const DAY_S = 86400;
/** HeiGIT retires api.openrouteservice.org on 2-6 Nov 2026; the same keys work here. */
const ORS_BASE = "https://api.heigit.org/openrouteservice/v2";
/** A router that hangs must not hold the page: give up after this long. */
export const ROUTER_TIMEOUT_MS = 8000;
/** The last stretch to a parking is a nicety (without it the drive stops a little short): never wait long for it. */
export const TAIL_TIMEOUT_MS = 4000;

/**
 * The free OpenRouteService key allows 40 routes a minute and 2,000 a day, and a trip page asks
 * for up to five (drive, its last stretch, the walk to the trail, each with a fallback). Someone
 * clicking through trips hit the minute limit, and drives, walks and their times came and went.
 * Same places, same answer: keep recent answers in the Worker's memory, and don't spend a
 * second call on a fallback when the router said "too many requests".
 */
export class RateLimited extends Error {}

/** The site's daily router budget is spent (lib/orsBudget.ts): answered like the router's own "too many". */
export class OverBudget extends RateLimited {}

const MEMO_MAX = 500;
const memo = new Map<string, DriveRoute>();

function remember(key: string, route: DriveRoute): DriveRoute {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
  memo.set(key, route);
  return route;
}

/** GeoJSON [lon, lat] -> our [lat, lon]. */
const flip = (coords: Pt[]): Pt[] => coords.map(([lon, lat]) => [lat, lon]);

export async function viaOrs(
  key: string,
  profile: OrsProfile,
  from: Pt,
  to: Pt,
  radiuses: [number, number],
  timeoutMs = ROUTER_TIMEOUT_MS
): Promise<DriveRoute> {
  const memoKey = `${profile}|${from}|${to}|${radiuses}`;
  const known = memo.get(memoKey);
  if (known) return known;
  if (!(await spendOrsCall())) throw new OverBudget(`ORS ${profile}: daily budget spent`);
  // POST so we can lift the 350 m snapping limit for points off the network.
  const res = await fetch(`${ORS_BASE}/directions/${profile}/geojson`, {
    method: "POST",
    headers: { Authorization: key, Accept: "application/geo+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      coordinates: [
        [from[1], from[0]],
        [to[1], to[0]],
      ],
      radiuses,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 429) throw new RateLimited(`ORS ${profile} 429`);
  if (!res.ok) throw new Error(`ORS ${profile} ${res.status}`);
  const f = (await res.json()).features?.[0];
  if (!f) throw new Error(`ORS ${profile}: no route`);
  return remember(memoKey, {
    durationMin: Math.round(f.properties.summary.duration / 60),
    distanceM: Math.round(f.properties.summary.distance),
    points: flip(f.geometry.coordinates),
  });
}

/** The matrix answers ~2,000 drives at once: give it longer than one route. */
const MATRIX_TIMEOUT_MS = 15000;

/**
 * Drive minutes from one start to many places in one call (OpenRouteService matrix: up to 3,500
 * pairs a request, 500 requests a day on the free key). null where a place has no road near it.
 */
export async function driveMatrix(key: string, from: Pt, to: Pt[]): Promise<(number | null)[]> {
  if (!(await spendOrsCall("matrix"))) throw new OverBudget("ORS matrix: daily budget spent");
  const res = await fetch(`${ORS_BASE}/matrix/driving-car`, {
    method: "POST",
    headers: { Authorization: key, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      locations: [from, ...to].map(([lat, lon]) => [lon, lat]),
      sources: [0],
      destinations: to.map((_, i) => i + 1),
      metrics: ["duration"],
    }),
    signal: AbortSignal.timeout(MATRIX_TIMEOUT_MS),
  });
  if (res.status === 429) throw new RateLimited("ORS matrix 429");
  if (!res.ok) throw new Error(`ORS matrix ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const row: unknown = (await res.json()).durations?.[0];
  if (!Array.isArray(row) || row.length !== to.length) throw new Error("ORS matrix: no durations");
  return row.map((s) => (typeof s === "number" && Number.isFinite(s) ? Math.round(s / 60) : null));
}

export async function viaOsrm(base: string, from: Pt, to: Pt): Promise<DriveRoute> {
  const url = `${base}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  const res = await fetch(url, { next: { revalidate: DAY_S }, signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS) } as RequestInit);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  const r = data.routes?.[0];
  if (data.code !== "Ok" || !r) throw new Error(`OSRM: ${data.code}`);
  return {
    durationMin: Math.round(r.duration / 60),
    distanceM: Math.round(r.distance),
    points: flip(r.geometry.coordinates),
  };
}

const OSRM_CAR = "https://router.project-osrm.org";
const FOSSGIS_FOOT = "https://routing.openstreetmap.de/routed-foot";

export async function driveRoute(key: string | undefined, from: Pt, to: Pt, snapM: number): Promise<DriveRoute> {
  if (!key) return viaOsrm(OSRM_CAR, from, to);
  try {
    return await viaOrs(key, "driving-car", from, to, [snapM, snapM]);
  } catch (err) {
    // Day's budget spent, busy or down: the public OSRM server still draws the road (no SLA, so
    // only as a fallback). If it fails too, the router's own error stands.
    return viaOsrm(OSRM_CAR, from, to).catch(() => Promise.reject(err));
  }
}

/**
 * On foot between two public places. Hiking paths first; if that finds no
 * way (a parking off the path network), plain walking, which also uses minor
 * roads and tracks.
 */
export async function walkRoute(key: string | undefined, from: Pt, to: Pt, snapM: number): Promise<DriveRoute> {
  if (!key) return viaOsrm(FOSSGIS_FOOT, from, to);
  try {
    return await viaOrs(key, "foot-hiking", from, to, [snapM, snapM]);
  } catch (err) {
    if (err instanceof RateLimited) throw err;
    console.warn("walk: foot-hiking failed, trying foot-walking", err);
    return viaOrs(key, "foot-walking", from, to, [snapM, snapM]);
  }
}

/**
 * The car's last stretch to a parking off the road network: one call on plain walking (minor
 * roads and tracks, the ways a car takes in; hiking paths aren't), with a short timeout.
 */
export function lastStretch(key: string | undefined, from: Pt, to: Pt, snapM: number): Promise<DriveRoute> {
  return key ? viaOrs(key, "foot-walking", from, to, [snapM, snapM], TAIL_TIMEOUT_MS) : viaOsrm(FOSSGIS_FOOT, from, to);
}

/** Drives that stop this close to each other for the same parking share its last stretch. */
const SAME_END_M = 30;
/** Ways in kept per parking (a parking reached from two valleys has two road ends). */
const ENDS_PER_PARKING = 4;

export interface KnownTail {
  from: Pt;
  route: DriveRoute;
}

/** Somewhere to keep last stretches between visitors (the edge cache), keyed by parking. */
export interface TailStore {
  get(to: Pt): Promise<KnownTail[] | null>;
  put(to: Pt, tails: KnownTail[]): Promise<void>;
}

const tailMemo = new Map<string, KnownTail[]>();

/**
 * Where the car router stops for a parking hardly depends on where the drive came from, so
 * the last stretch from there is asked once per parking, not once per visitor: from this
 * Worker's memory, else the shared store, else the router (and then kept in both).
 */
export async function knownTail(
  from: Pt,
  to: Pt,
  ask: (from: Pt, to: Pt) => Promise<DriveRoute>,
  store?: TailStore
): Promise<DriveRoute> {
  const id = String(to);
  const near = (list: KnownTail[] | null | undefined) => list?.find((t) => dist(t.from, from) <= SAME_END_M)?.route;
  const mem = near(tailMemo.get(id));
  if (mem) return mem;
  const stored = store ? await store.get(to).catch(() => null) : null;
  const hit = near(stored);
  if (hit) {
    rememberTails(id, stored!);
    return hit;
  }
  const route = await ask(from, to);
  const list = [{ from, route }, ...(stored ?? tailMemo.get(id) ?? [])].slice(0, ENDS_PER_PARKING);
  rememberTails(id, list);
  await store?.put(to, list).catch(() => undefined);
  return route;
}

function rememberTails(id: string, list: KnownTail[]) {
  if (tailMemo.size >= MEMO_MAX && !tailMemo.has(id)) tailMemo.delete(tailMemo.keys().next().value!);
  tailMemo.set(id, list);
}

const dist = (a: Pt, b: Pt) => haversineM({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });

/** Past this, the road route stopped short of the parking (it snapped to another road). */
export const GAP_M = 80;
/** Forest roads and tracks to a trailhead parking: about this fast. */
const LAST_STRETCH_KMH = 20;

/**
 * The car router snaps a parking off its road network (a forest road, a
 * track, a lot inside a field) to the nearest road it knows, which can be
 * far away, and the line would then jump straight to the parking. Follow the
 * real ways for that last stretch with the foot router (it knows tracks and
 * minor roads) and add it to the drive at a slow pace.
 *
 * `onTailFailed` hears when that last stretch could not be asked for (router
 * down or busy): the drive then stops short, and should not be kept long.
 */
export async function finishDrive(
  route: DriveRoute,
  to: Pt,
  tail: (from: Pt, to: Pt) => Promise<DriveRoute>,
  onTailFailed?: () => void
): Promise<DriveRoute> {
  const end = route.points[route.points.length - 1];
  if (!end) return route;
  const gap = dist(end, to);
  if (gap <= GAP_M) return route;
  try {
    const last = await tail(end, to);
    // A detour much longer than the gap is a wrong turn, not the way in.
    if (last.distanceM > Math.max(3 * gap, gap + 1500)) return route;
    const trimmed = dropDeadEnd(route, last);
    const walk = trimmed.tail;
    return {
      durationMin: trimmed.drive.durationMin + Math.max(1, Math.round((walk.distanceM / 1000 / LAST_STRETCH_KMH) * 60)),
      distanceM: trimmed.drive.distanceM + walk.distanceM,
      points: [...trimmed.drive.points, ...walk.points],
    };
  } catch (err) {
    console.warn("drive: last stretch to the parking failed", err);
    onTailFailed?.();
    return route;
  }
}

/** A tail point this close to the drive is still on the road the car came in by. */
const SAME_WAY_M = 20;

const lineM = (pts: Pt[]) => pts.reduce((sum, p, i) => (i ? sum + dist(pts[i - 1], p) : 0), 0);

/**
 * The car router ends at the road point nearest the parking, which can be
 * down a dead end the walk then has to come back out of. Where the walk
 * starts by retracing the drive, stop the car where the walk leaves the road
 * and drop both copies of that stretch.
 */
export function dropDeadEnd(drive: DriveRoute, tail: DriveRoute): { drive: DriveRoute; tail: DriveRoute } {
  const road = drive.points.map(([lat, lon]) => ({ lat, lon }));
  let cut: { i: number; point: { lat: number; lon: number } } | null = null;
  let k = 0;
  for (let t = 1; t < tail.points.length; t++) {
    const [lat, lon] = tail.points[t];
    const hit = nearestOnPath(road.slice(0, (cut?.i ?? road.length - 1) + 2), { lat, lon });
    if (!hit || hit.distanceM > SAME_WAY_M) break;
    cut = hit;
    k = t;
  }
  if (!cut || k === 0) return { drive, tail };
  const at: Pt = [cut.point.lat, cut.point.lon];
  const kept: Pt[] = [...drive.points.slice(0, cut.i + 1), at];
  const keptM = lineM(kept);
  const fullM = lineM(drive.points);
  const share = fullM > 0 ? keptM / fullM : 1;
  const rest: Pt[] = [at, ...tail.points.slice(k + 1)];
  const restM = lineM(rest);
  const tailM = lineM(tail.points);
  return {
    drive: {
      durationMin: Math.round(drive.durationMin * share),
      distanceM: Math.round(drive.distanceM * share),
      points: kept,
    },
    tail: {
      durationMin: tail.durationMin,
      distanceM: tailM > 0 ? Math.round(tail.distanceM * (restM / tailM)) : tail.distanceM,
      points: rest,
    },
  };
}

/**
 * Fewer points with the shape kept (Douglas-Peucker, `tolM` metres): a long
 * drive stays light to send and draw, and still follows every bend when zoomed in.
 */
export function simplifyLine(points: Pt[], tolM: number): Pt[] {
  if (points.length <= 2) return points;
  const lat0 = points[0][0];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  const xy = points.map(([lat, lon]) => [lon * kx, lat * ky]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let farD = tolM;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      // Distance to the segment, not the endless line through it: a spur that runs out past an end
      // and comes back the same way lies on that line and would otherwise be cut off.
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
