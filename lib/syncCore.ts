import type { KindAnswer, SyncAnswer, SyncRequest, WireItem } from "@/lib/syncMerge";

// The device side of account sync as plain data in, plain data out (the browser wiring that reads
// and writes localStorage comes on top of this). `synced` remembers, per key, the `at` the server
// is known to hold, so only items changed since then travel with a body.

export interface LocalList { items: WireItem[] }
export interface Synced { [key: string]: number }
export interface DeviceState { plans: WireItem[]; visits: WireItem[]; synced: { plans: Synced; visits: Synced } }

/** Characters of bodies in one request; the server answers "want" for what did not fit. */
const BUDGET = 400_000;

type Lists = "plans" | "visits";
const LISTS: Lists[] = ["plans", "visits"];

/** A budget that always lets the first body through, so one oversized item still moves. */
function spender(budget: number): (body: unknown) => boolean {
  let used = 0;
  let any = false;
  return (body) => {
    const size = JSON.stringify(body).length;
    if (any && used + size > budget) return false;
    any = true;
    used += size;
    return true;
  };
}

const bare = (item: WireItem): WireItem => (item.gone ? { key: item.key, at: item.at, gone: true } : { key: item.key, at: item.at });

export function buildRequest(state: DeviceState, budget = BUDGET): SyncRequest {
  const fits = spender(budget);
  const req: SyncRequest = {};
  for (const list of LISTS) {
    req[list] = state[list].map((item) => {
      if (item.gone) return bare(item);
      if (state.synced[list][item.key] !== item.at && item.body !== undefined && fits(item.body)) return item;
      return bare(item);
    });
  }
  return req;
}

/** The next request to send after an answer, or null when the exchange is complete. */
export function buildFollowUp(state: DeviceState, answer: SyncAnswer, budget = BUDGET): SyncRequest | null {
  const fits = spender(budget);
  const wants = { plans: new Set(answer.plans.want), visits: new Set(answer.visits.want) };
  if (wants.plans.size || wants.visits.size) {
    const req: SyncRequest = { partial: true };
    for (const list of LISTS) {
      req[list] = state[list]
        .filter((item) => wants[list].has(item.key))
        // Over the budget, an item is named again without its body; the server asks for it once more.
        .map((item) => (item.gone || (item.body !== undefined && fits(item.body)) ? item : bare(item)));
    }
    return req;
  }
  return answer.more ? buildRequest(state, budget) : null;
}

function applyKind(items: WireItem[], synced: Synced, sent: WireItem[], answer: KindAnswer): { items: WireItem[]; synced: Synced } {
  const local = new Map(items.map((i) => [i.key, i]));
  const nextSynced: Synced = { ...synced };
  for (const [key, at] of Object.entries(answer.at)) {
    const item = local.get(key);
    if (item) local.set(key, { ...item, at });
  }
  const want = new Set(answer.want);
  const received = new Set(answer.send.map((s) => s.key));
  for (const s of sent) {
    if (want.has(s.key) || received.has(s.key)) continue;
    const item = local.get(s.key);
    if (!item) continue;
    // The server holds this version now (stored, or it already had the same one).
    nextSynced[s.key] = item.at;
    // A deletion the server keeps needs no copy here.
    if (item.gone) {
      local.delete(s.key);
      delete nextSynced[s.key];
    }
  }
  for (const r of answer.send) {
    // Never trade a newer copy for an older one: the server can hold an old version of something it
    // refused to take from this device (too big, account full), and that must not undo the change here.
    const mine = local.get(r.key);
    if (mine && mine.at > r.at) continue;
    if (r.gone) {
      local.delete(r.key);
      delete nextSynced[r.key];
    } else {
      local.set(r.key, r);
      nextSynced[r.key] = r.at;
    }
  }
  return { items: [...local.values()], synced: nextSynced };
}

/** The state after an answer: a new object, the old one is not touched. */
export function applyAnswer(state: DeviceState, sent: SyncRequest, answer: SyncAnswer): DeviceState {
  const plans = applyKind(state.plans, state.synced.plans, sent.plans ?? [], answer.plans);
  const visits = applyKind(state.visits, state.synced.visits, sent.visits ?? [], answer.visits);
  return { plans: plans.items, visits: visits.items, synced: { plans: plans.synced, visits: visits.synced } };
}

export async function runSync(state: DeviceState, post: (r: SyncRequest) => Promise<SyncAnswer>, maxRounds = 8): Promise<DeviceState> {
  let current = state;
  let req: SyncRequest | null = buildRequest(current);
  for (let round = 0; req && round < maxRounds; round++) {
    const answer = await post(req);
    current = applyAnswer(current, req, answer);
    req = buildFollowUp(current, answer);
  }
  return current;
}
