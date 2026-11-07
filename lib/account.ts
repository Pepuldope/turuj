"use client";

import { useEffect, useSyncExternalStore } from "react";
import { setOptedOut } from "@/lib/analytics";

// Who is signed in, for the browser (app/api/auth/me). Asked once per page load and shared by
// every component; signing in or out updates them all.

export interface MyAccount {
  email: string;
  name: string | null;
  /** A team account: no browser of it is counted (set on /statistiky). */
  team?: boolean;
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
    .then((j: { account: MyAccount | null }) => {
      // A team account switches counting off in whatever browser it signs in on, as "?nepocitat=1" does.
      if (j.account?.team) setOptedOut(true);
      set({ loaded: true, account: j.account ?? null });
    })
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
  if (account.team) setOptedOut(true);
  set({ loaded: true, account });
}

/** Resolves once we know who is signed in (the shared /api/auth/me answer), so a team browser is opted out before anything counts. */
export function whenAccountKnown(): Promise<void> {
  return ask();
}

/** Marks or unmarks the signed-in account as a team one, and the same on this browser; false when the server couldn't. */
export async function setTeamAccount(team: boolean): Promise<boolean> {
  const r = await fetch("/api/auth/team", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team }),
  }).catch(() => null);
  if (!r?.ok) return false;
  setOptedOut(team);
  if (state.account) set({ loaded: true, account: { ...state.account, team } });
  return true;
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
