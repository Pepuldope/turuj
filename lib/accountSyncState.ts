import { DEVICE_FIELDS, planAt } from "@/lib/savedTrips";
import type { SavedTrip } from "@/lib/savedTrips";
import type { Visit } from "@/lib/visits";
import type { DeviceState, Synced } from "@/lib/syncCore";
import { cleanHow } from "@/lib/syncMerge";
import type { WireItem } from "@/lib/syncMerge";

// The mapping between what this device keeps (saved trips, visits, and the removals it remembers)
// and the plain lists the sync exchange works on. Pure, so the whole round trip runs in tests.

export interface DeviceLists {
  trips: SavedTrip[];
  savedGone: Record<string, number>;
  visits: Visit[];
  visitsGone: Record<string, number>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** About 100 m: as exact as the start place gets on our server (/sukromie, bod 10). */
const round100m = (n: number) => Math.round(n * 1000) / 1000;

/** The plan as it travels: no device fields, no stamp (that is the item's `at`), and the start place only roughly. */
function planBody(trip: SavedTrip): unknown {
  const body: Record<string, unknown> = { ...trip };
  for (const f of DEVICE_FIELDS) delete body[f];
  delete body.changedAt;
  if (trip.start) body.start = { ...trip.start, lat: round100m(trip.start.lat), lon: round100m(trip.start.lon) };
  return body;
}

/** Live items and removals as one list; when a key is both, the newer one wins. */
function items<T>(live: T[], keyOf: (x: T) => string, atOf: (x: T) => number, bodyOf: (x: T) => unknown, gone: Record<string, number>): WireItem[] {
  const out = new Map<string, WireItem>();
  for (const [key, at] of Object.entries(gone)) out.set(key, { key, at, gone: true });
  for (const x of live) {
    const key = keyOf(x);
    const at = atOf(x);
    const prev = out.get(key);
    if (!prev || at >= prev.at) out.set(key, { key, at, body: bodyOf(x) });
  }
  return [...out.values()];
}

export function toDevice(lists: DeviceLists, synced: DeviceState["synced"]): DeviceState {
  return {
    plans: items(lists.trips, (t) => t.slug, planAt, planBody, lists.savedGone),
    visits: items(lists.visits, (v) => v.id, (v) => v.at, (v) => ({ slug: v.slug, route: v.route, name: v.name, date: v.date, from: v.from, ...(v.how ? { how: v.how } : {}) }), lists.visitsGone),
    synced,
  };
}

/** A plan body from the server, or null when it is not fit to be a saved trip. */
function asTrip(body: unknown): Omit<SavedTrip, "offline" | "changedAt"> | null {
  if (!isObject(body)) return null;
  for (const f of ["slug", "name", "date", "time", "savedAt"]) if (typeof body[f] !== "string") return null;
  if (typeof body.hikeMin !== "number" || !isObject(body.sun)) return null;
  return body as unknown as Omit<SavedTrip, "offline" | "changedAt">;
}

function asVisit(key: string, at: number, body: unknown): Visit | null {
  if (!isObject(body)) return null;
  const { slug, route, name, date, from } = body;
  if (typeof slug !== "string" || typeof route !== "string" || typeof name !== "string" || typeof date !== "string") return null;
  if (from !== "plan" && from !== "manual") return null;
  const how = cleanHow(body.how);
  return { id: key, slug, route, name, date, from, at, ...(how ? { how } : {}) };
}

const byKey = (list: WireItem[]) => new Map(list.map((i) => [i.key, i]));

interface Merged<T> { live: T[]; gone: Record<string, number>; synced: Synced; dropped: string[]; arrived: string[] }

/**
 * One kind of item: `make` turns a live server item into the local one (given the local copy, if any).
 * An item the person changed while the exchange ran is left alone and stays unsynced.
 */
function mergeKind<T>(
  result: WireItem[],
  before: WireItem[],
  now: WireItem[],
  beforeSynced: Synced,
  resultSynced: Synced,
  localLive: T[],
  keyOf: (x: T) => string,
  make: (item: WireItem, local: T | undefined) => T | null,
): Merged<T> {
  const res = byKey(result);
  const was = byKey(before);
  const nowItems = byKey(now);
  const local = new Map(localLive.map((x) => [keyOf(x), x]));
  const live: T[] = [];
  const gone: Record<string, number> = {};
  const synced: Synced = {};
  const dropped: string[] = [];
  const arrived: string[] = [];
  const keys = new Set([...res.keys(), ...nowItems.keys()]);
  for (const key of keys) {
    const mine = nowItems.get(key);
    const old = was.get(key);
    if (mine?.at !== old?.at || !!mine?.gone !== !!old?.gone) {
      // Changed during the exchange: keep this device's version and send it next time.
      if (mine) {
        if (mine.gone) gone[key] = mine.at;
        else if (local.has(key)) live.push(local.get(key) as T);
      }
      if (key in beforeSynced) synced[key] = beforeSynced[key];
      continue;
    }
    const item = res.get(key);
    if (!item) {
      // The result does not hold it: removed on the server's side of things.
      if (mine && !mine.gone) dropped.push(key);
      continue;
    }
    if (item.gone) {
      if (mine && !mine.gone) dropped.push(key);
      gone[key] = item.at;
      continue;
    }
    const made = make(item, local.get(key));
    if (!made) {
      // Not fit to use: keep what this device has, if anything.
      if (local.has(key)) live.push(local.get(key) as T);
      if (key in beforeSynced) synced[key] = beforeSynced[key];
      continue;
    }
    if (!local.has(key)) arrived.push(key);
    live.push(made);
    if (key in resultSynced) synced[key] = resultSynced[key];
  }
  return { live, gone, synced, dropped, arrived };
}

export function fromDevice(result: DeviceState, before: DeviceState, now: DeviceLists): { lists: DeviceLists; synced: DeviceState["synced"]; removed: string[]; arrived: string[] } {
  const nowState = toDevice(now, before.synced);
  const plans = mergeKind<SavedTrip>(result.plans, before.plans, nowState.plans, before.synced.plans, result.synced.plans, now.trips, (t) => t.slug, (item, local) => {
    const body = asTrip(item.body);
    if (!body) return null;
    const fields: Partial<SavedTrip> = {};
    for (const f of DEVICE_FIELDS) if (local && local[f] !== undefined) (fields as Record<string, unknown>)[f] = local[f];
    // A forecast copy is for one day: another day arrived, so it is no use here.
    if (local && local.date !== body.date) delete fields.weather;
    return { ...body, changedAt: item.at, offline: local ? local.offline : "none", ...fields };
  });
  const visits = mergeKind<Visit>(result.visits, before.visits, nowState.visits, before.synced.visits, result.synced.visits, now.visits, (v) => v.id, (item) => asVisit(item.key, item.at, item.body));
  // Newest saved first, as the list is kept.
  const trips = plans.live.map((t, i) => ({ t, i })).sort((a, b) => (Date.parse(b.t.savedAt) || 0) - (Date.parse(a.t.savedAt) || 0) || a.i - b.i).map((x) => x.t);
  return {
    lists: { trips, savedGone: plans.gone, visits: visits.live, visitsGone: visits.gone },
    synced: { plans: plans.synced, visits: visits.synced },
    removed: plans.dropped,
    arrived: plans.arrived,
  };
}
