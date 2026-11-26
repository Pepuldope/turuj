"use client";

import { useSyncExternalStore } from "react";
import { fromDevice, toDevice } from "@/lib/accountSyncState";
import type { DeviceLists } from "@/lib/accountSyncState";
import { readSavedGone, readSavedTrips, tripCacheName, writeSavedGone, writeSavedTrips } from "@/lib/savedTrips";
import { runSync } from "@/lib/syncCore";
import type { DeviceState } from "@/lib/syncCore";
import type { SyncAnswer, SyncRequest } from "@/lib/syncMerge";
import { readVisits, readVisitsGone, writeVisits, writeVisitsGone } from "@/lib/visits";

// Account sync in the browser: reads the device's lists, exchanges them with /api/sync and writes
// back what changed. The merge itself lives in lib/syncCore.ts and lib/accountSyncState.ts.

const KEY = "turuj-sync";

interface Memory { account: string; synced: DeviceState["synced"]; at: number | null }
export interface SyncStatus { state: "off" | "ok" | "failed"; busy: boolean; at: number | null }

const emptySynced = (): DeviceState["synced"] => ({ plans: {}, visits: {} });

function readMemory(account: string): Memory {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) ?? "null") as Memory | null;
    // Another account signed in on this device: everything merges into it, so start from nothing.
    if (m && m.account === account && m.synced?.plans && m.synced?.visits) return m;
  } catch {
    // Unreadable memory counts as none.
  }
  return { account, synced: emptySynced(), at: null };
}

function writeMemory(m: Memory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // Storage full / blocked: the next sync sends everything again, which is safe.
  }
}

function readLists(): DeviceLists {
  return { trips: readSavedTrips(), savedGone: readSavedGone(), visits: readVisits(), visitsGone: readVisitsGone() };
}

function differs(state: DeviceState["plans"], synced: Record<string, number>): boolean {
  return state.some((i) => synced[i.key] !== i.at);
}

/** True when something on this device is not yet known to the account (or another account was the last one here). */
export function needsSync(account: string): boolean {
  let m: Memory | null = null;
  try {
    m = JSON.parse(localStorage.getItem(KEY) ?? "null") as Memory | null;
  } catch {
    m = null;
  }
  if (!m || m.account !== account || !m.synced?.plans || !m.synced?.visits) return true;
  const state = toDevice(readLists(), m.synced);
  return differs(state.plans, m.synced.plans) || differs(state.visits, m.synced.visits);
}

/** When the last exchange of this account finished, or null. */
export function lastSyncAt(account: string): number | null {
  return readMemory(account).at;
}

/** The state before anything is known. One object, so the server render and the first client render get the same snapshot. */
const OFF: SyncStatus = { state: "off", busy: false, at: null };
let status: SyncStatus = OFF;
const listeners = new Set<() => void>();

function setStatus(next: Partial<SyncStatus>) {
  status = { ...status, ...next };
  for (const l of listeners) l();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => status,
    () => OFF,
  );
}

/** Nobody is signed in (any more). */
export function syncOff() {
  setStatus({ state: "off", busy: false });
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`sync ${status}`);
  }
}

async function post(req: SyncRequest): Promise<SyncAnswer> {
  const r = await fetch("/api/sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  if (!r.ok) throw new HttpError(r.status);
  return (await r.json()) as SyncAnswer;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

async function exchange(account: string) {
  const memory = readMemory(account);
  const startLists = readLists();
  const before = toDevice(startLists, memory.synced);
  const result = await runSync(before, post);
  const now = readLists();
  const out = fromDevice(result, before, now);
  // Only what changed is written, so a quiet sync fires no events.
  if (!same(out.lists.trips, now.trips)) writeSavedTrips(out.lists.trips);
  if (!same(out.lists.savedGone, now.savedGone)) writeSavedGone(out.lists.savedGone);
  if (!same(out.lists.visits, now.visits)) writeVisits(out.lists.visits);
  if (!same(out.lists.visitsGone, now.visitsGone)) writeVisitsGone(out.lists.visitsGone);
  const at = Date.now();
  writeMemory({ account, synced: out.synced, at });
  for (const slug of out.removed) {
    try {
      await caches.delete(tripCacheName(slug));
    } catch {
      // No Cache API (old browser / insecure context): only the record is removed.
    }
  }
  return at;
}

let running: Promise<void> | null = null;
let again: string | null = null;

/**
 * Looks whether another device changed something: syncs unless an exchange is running or the last one
 * finished less than `ms` ago. For the quiet triggers (the tab comes back, Moje výlety is open).
 */
export function syncIfOlder(account: string, ms: number): void {
  if (running) return;
  const at = lastSyncAt(account);
  if (at === null || Date.now() - at > ms) void syncNow(account);
}

/** Syncs now. One exchange at a time: a call during one makes it run once more afterwards. */
export function syncNow(account: string): Promise<void> {
  if (running) {
    again = account;
    return running;
  }
  // No signal (on the trail, say) is not a failure: the "online" event and the next page load try again.
  if (navigator.onLine === false) return Promise.resolve();
  running = (async () => {
    let next: string | null = account;
    while (next) {
      const who: string = next;
      again = null;
      setStatus({ busy: true });
      try {
        const at = await exchange(who);
        setStatus({ state: "ok", at });
      } catch (e) {
        // 401: the session ended, the account is signed out. Signal lost on the way: not a failure, it runs again later.
        if (e instanceof HttpError && e.status === 401) setStatus({ state: "off" });
        else if (navigator.onLine !== false) setStatus({ state: "failed" });
      }
      next = again;
    }
    setStatus({ busy: false });
  })().finally(() => {
    running = null;
  });
  return running;
}
