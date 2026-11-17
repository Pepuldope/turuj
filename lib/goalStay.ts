"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { DestinationKind } from "@/lib/tripSchema";

/**
 * Time spent at the trip's goal (C190, Peter 17 Nov 2026): a default per kind of goal, a researched one for the
 * places with a guided tour, and the visitor's own number, which wins. It goes into the day like a stop at the goal:
 * our walk times (DIN 33466) are walking only, with no breaks in them. Research and sources:
 * Túruj/research/c190-stay-time.md (only the show caves and the guided castles are sourced, the rest are estimates).
 */
export const STAY_BY_KIND: Record<DestinationKind, number> = {
  vrchol: 15,
  vyhliadka: 10,
  hrad: 25,
  chata: 40,
  pleso: 25,
  vodopad: 15,
  // A cave you look at from outside; the show caves have their own numbers below.
  jaskyna: 10,
  roklina: 10,
  ine: 10,
};

/** A place with a guided tour: the tour, and the wait for the next start (the smaller average of the season's gaps). */
interface Guided {
  tour: number;
  wait: number;
  source: string;
}

// Show caves, ssj.sk (read 17 Nov 2026): June-August a tour every hour (average wait 30 min), other months four
// starts about 90 min apart (45 min). Peter (17 Nov): tour plus the lesser average wait.
const CAVE_WAIT = 30;
const GUIDED: Record<string, Guided> = {
  "Demänovská jaskyňa Slobody": { tour: 60, wait: CAVE_WAIT, source: "ssj.sk" },
  "Belianska jaskyňa": { tour: 70, wait: CAVE_WAIT, source: "ssj.sk" },
  "Bystrianska jaskyňa": { tour: 45, wait: CAVE_WAIT, source: "ssj.sk" },
  "Dobšinská ľadová jaskyňa": { tour: 30, wait: CAVE_WAIT, source: "ssj.sk" },
  "Jaskyňa Domica": { tour: 45, wait: CAVE_WAIT, source: "ssj.sk" },
  "Ochtinská aragonitová jaskyňa": { tour: 30, wait: CAVE_WAIT, source: "ssj.sk" },
  "Gombasecká jaskyňa": { tour: 30, wait: CAVE_WAIT, source: "ssj.sk" },
  "Jasovská jaskyňa": { tour: 45, wait: CAVE_WAIT, source: "ssj.sk" },
  "Harmanecká jaskyňa": { tour: 60, wait: CAVE_WAIT, source: "ssj.sk" },
  "Jaskyňa Driny": { tour: 35, wait: CAVE_WAIT, source: "ssj.sk" },
  // Summer starts every 75 min.
  "Brestovská jaskyňa": { tour: 50, wait: 35, source: "ssj.sk" },
  // Castles with a guided tour. Červený Kameň: tours every 2 h (official), the large tour about 75 min (guides).
  "Hrad Červený Kameň": { tour: 75, wait: 60, source: "hrad-cervenykamen.sk" },
  // Hourly guided tours; the length is not published, estimate.
  "Modrý Kameň": { tour: 50, wait: 30, source: "odhad" },
  // Self-guided museum, 2-3 h by visitors' accounts.
  "Spišský hrad": { tour: 120, wait: 0, source: "odhad" },
};

export interface StayDefault {
  min: number;
  /** Set for a place with a guided tour: how the number is made up. */
  guided: Guided | null;
}

export function goalStayDefault(kind: DestinationKind, name: string | null | undefined): StayDefault {
  const guided = name ? (GUIDED[name.trim()] ?? null) : null;
  return guided ? { min: guided.tour + guided.wait, guided } : { min: STAY_BY_KIND[kind] ?? 10, guided: null };
}

export const STAY_STEP = 5;
export const STAY_MAX = 300;

// The visitor's own numbers, per trip, kept on this device (a saved trip opens with the same).
const KEY = "turuj-goal-stay";
const EVENT = "turuj-goal-stay";
let cache: Record<string, number> | null = null;

function readAll(): Record<string, number> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: Record<string, number>) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: kept for this visit only.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** The stay at this trip's goal: the visitor's own number or the default, and how to change it. */
export function useGoalStay(slug: string, fallback: number) {
  const own = useSyncExternalStore(
    subscribe,
    () => readAll()[slug] ?? null,
    () => null
  );
  const set = useCallback(
    (min: number) => {
      const { [slug]: _, ...rest } = readAll(); // eslint-disable-line @typescript-eslint/no-unused-vars
      const v = Math.max(0, Math.min(STAY_MAX, Math.round(min)));
      write(v === fallback ? rest : { ...rest, [slug]: v });
    },
    [slug, fallback]
  );
  return { min: own ?? fallback, changed: own !== null && own !== fallback, set, reset: () => set(fallback) };
}
