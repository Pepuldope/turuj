"use client";

import { useSyncExternalStore } from "react";

// The route the pointer is on, shared by the route list and the trip map (desktop), so
// hovering either lights up both. Null when none.
let hovered: string | null = null;
const listeners = new Set<() => void>();

export function setHoveredRoute(slug: string | null) {
  if (slug === hovered) return;
  hovered = slug;
  for (const l of listeners) l();
}

export function useHoveredRoute(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hovered,
    () => null
  );
}

// Whether the plan's step 1 (Kadiaľ pôjdete) is open, so the big map lights up other routes only while the route
// is being chosen, also when step 1 is shut by a tap on its header (Peter, 18 Nov). Null on pages without the plan.
let routeStep: boolean | null = null;
const stepListeners = new Set<() => void>();

export function setRouteStepOpen(open: boolean | null) {
  if (open === routeStep) return;
  routeStep = open;
  for (const l of stepListeners) l();
}

export function useRouteStepOpen(): boolean | null {
  return useSyncExternalStore(
    (l) => {
      stepListeners.add(l);
      return () => stepListeners.delete(l);
    },
    () => routeStep,
    () => null
  );
}
