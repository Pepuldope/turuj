// The merge rule for account sync (saved trips and visits across devices), kept pure so the server
// (lib/syncStore.ts) and the tests share it. Per item the newest change wins by a millisecond
// timestamp `at`; a deletion stays as a tombstone (`gone`) so it reaches the other devices; and
// nothing is dropped silently: an item that fails the checks is skipped, never stored.

export type SyncKind = "plan" | "visit";
/** One item as it travels: `body` is absent when the sender only states which version it has. */
export interface WireItem { key: string; at: number; gone?: true; body?: unknown }
export interface SyncRequest { partial?: boolean; plans?: WireItem[]; visits?: WireItem[] }
export interface KindAnswer { send: WireItem[]; want: string[]; at: Record<string, number> }
export interface SyncAnswer { ok: true; now: number; more: boolean; plans: KindAnswer; visits: KindAnswer }
/** What the server holds for one item, without the body. */
export interface Held { at: number; gone: boolean; size: number }

export const MAX_PLANS = 300;
export const MAX_VISITS = 3000;
/** Characters of one plan's JSON. The largest trip file is 46 kB (25 Nov 2026); a saved plan adds the height profile and stays under about 150 kB. */
export const MAX_PLAN_BODY = 600_000;
export const MAX_VISIT_BODY = 2_000;
/** Characters of one request. */
export const MAX_REQUEST = 2_000_000;
/** Characters of bodies in one answer; the rest comes on the next round. */
export const SEND_BUDGET = 1_000_000;

const PLAN_KEY = /^[a-z0-9][a-z0-9-]{0,119}$/;
// The key of a visit holds the route walked, which can be "<slug>/okruh" for a loop.
const VISIT_KEY = /^[pm]:[A-Za-z0-9:_/-]{1,160}$/;
/** The route of a visit: a trip's own slug, or that slug and "/okruh" for the loop. Empty when the visitor did not know which route it was. */
const ROUTE = /^[a-z0-9][a-z0-9-]{0,119}(\/okruh)?$/;
/** The day of a visit: a full day, a year, a year and season (sp, su, au, wi), or empty when not known. */
export const VISIT_DATE = /^(\d{4}(-(\d{2}-\d{2}|sp|su|au|wi))?)?$/;
/** Plan fields that describe one device only (offline copy, evening reminder, forecast copy). */
const DEVICE_ONLY = ["offline", "eve", "weather"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A normalised copy of one incoming item, or null when it is not valid. */
export function cleanItem(kind: SyncKind, raw: unknown, now: number): WireItem | null {
  if (!isObject(raw)) return null;
  const { key, at } = raw;
  if (typeof key !== "string" || !(kind === "plan" ? PLAN_KEY : VISIT_KEY).test(key)) return null;
  if (typeof at !== "number" || !Number.isInteger(at) || at <= 0) return null;
  // A phone with a wrong clock must not win for ever.
  const clamped = Math.min(at, now);
  if (raw.gone === true) return { key, at: clamped, gone: true };
  if (raw.body === undefined) return { key, at: clamped };
  if (!isObject(raw.body)) return null;
  const b = raw.body;
  if (kind === "plan") {
    if (b.slug !== key) return null;
    const body: Record<string, unknown> = { ...b };
    for (const f of DEVICE_ONLY) delete body[f];
    if (JSON.stringify(body).length > MAX_PLAN_BODY) return null;
    return { key, at: clamped, body };
  }
  const { slug, route, name, date, from } = b;
  // The place can be empty: a plan saved before visits existed does not know its place yet.
  if (typeof slug !== "string" || (slug !== "" && !PLAN_KEY.test(slug))) return null;
  // "Neviem, ktorou trasou": no route, and then the place is what says where the visit was.
  if (typeof route !== "string" || !(ROUTE.test(route) || (route === "" && slug !== ""))) return null;
  if (typeof name !== "string" || name.length < 1 || name.length > 200) return null;
  if (typeof date !== "string" || !VISIT_DATE.test(date)) return null;
  if (from !== "plan" && from !== "manual") return null;
  const body = { slug, route, name, date, from };
  if (JSON.stringify(body).length > MAX_VISIT_BODY) return null;
  return { key, at: clamped, body };
}

/**
 * Compares what a device lists with what the server holds. `store` is what the client wins (to be
 * written), `sendKeys` what the server wins (to go back), `want` the keys where the client is newer
 * but only named its version, so it must send the body.
 */
export function decide(client: WireItem[], held: Map<string, Held>, partial: boolean): { store: WireItem[]; sendKeys: string[]; want: string[] } {
  const newest = new Map<string, WireItem>();
  for (const c of client) {
    const prev = newest.get(c.key);
    if (!prev || c.at > prev.at) newest.set(c.key, c);
  }
  const store: WireItem[] = [];
  const sendKeys: string[] = [];
  const want: string[] = [];
  for (const c of newest.values()) {
    const h = held.get(c.key);
    if (!h || c.at > h.at) {
      if (c.gone || c.body !== undefined) store.push(c);
      else want.push(c.key);
    } else if (c.at < h.at) sendKeys.push(c.key);
  }
  if (!partial) {
    // A held tombstone is not sent to a device that never had the item: it needs nothing.
    for (const [key, h] of held) if (!newest.has(key) && !h.gone) sendKeys.push(key);
  }
  return { store, sendKeys, want };
}
