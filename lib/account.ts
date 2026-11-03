"use client";

import { useEffect, useSyncExternalStore } from "react";

// Who is signed in, for the browser (app/api/auth/me). Asked once per page load and shared by
// every component; signing in or out updates them all.

export interface MyAccount {
  email: string;
  name: string | null;
}

type State = { loaded: boolean; account: MyAccount | null };

let state: State = { loaded: false, account: null };
let asked: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

function ask() {
  asked ??= fetch("/api/auth/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : { account: null }))
    .then((j: { account: MyAccount | null }) => set({ loaded: true, account: j.account ?? null }))
    .catch(() => set({ loaded: true, account: null }));
  return asked;
}

const SERVER: State = { loaded: false, account: null };

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function useAccount(): State {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER);
  useEffect(() => void ask(), []);
  return s;
}

export function signedIn(account: MyAccount) {
  set({ loaded: true, account });
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  set({ loaded: true, account: null });
}

/** Deletes the signed-in account for good; false when the server couldn't. */
export async function deleteMyAccount(): Promise<boolean> {
  const r = await fetch("/api/auth/delete", { method: "POST", credentials: "same-origin" }).catch(() => null);
  if (!r?.ok) return false;
  set({ loaded: true, account: null });
  return true;
}

/** Where "Pokračovať cez Google" goes: back to this page afterwards. */
export function googleHref(): string {
  const here = `${location.pathname}${location.search.replace(/[?&]prihlasenie=[^&]*/, "")}`;
  return `/api/auth/google?next=${encodeURIComponent(here || "/")}`;
}
