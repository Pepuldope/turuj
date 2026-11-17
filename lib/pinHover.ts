"use client";

import { useEffect, useSyncExternalStore } from "react";

// The map pin the mouse is on, or the list row of one (a stop, a parking, a bus or train stop), shared by the
// plan's rows and the trip map (desktop), so hovering either lights up both. The id is the pin's own
// ("poi-…", "pk-…", "ts-…", as lib/mapFocus.ts). Null when none. Routes have their own, lib/routeHover.ts.
let hovered: string | null = null;
const listeners = new Set<() => void>();

export function setHoveredPin(id: string | null) {
  if (id === hovered) return;
  hovered = id;
  for (const l of listeners) l();
}

export function getHoveredPin(): string | null {
  return hovered;
}

/** Whether the hover store knows this pin: only stops, parking and transit stops light up. */
export function isHoverablePin(id: string): boolean {
  return /^(poi|pk|ts)-/.test(id);
}

export function useHoveredPin(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => hovered,
    () => null
  );
}

/**
 * Pointer handlers for a list row. A real mouse only: iPhone Safari treats the first tap as a hover, and a row
 * that changed on it needed a second tap (the same rule as the route rows, C173). Clicking clears it.
 */
export function pinRowHover(id: string) {
  return {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") setHoveredPin(id);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") setHoveredPin(null);
    },
    onClickCapture: () => setHoveredPin(null),
  };
}

/** The row outline, as the route rows'. */
const ROW_HOVER = "outline-2 outline-[var(--accent)] outline outline-offset-[-2px]";

/** For a list of rows made in one loop: the hovered pin, the outline for a row, and a clear when the list goes away. */
export function usePinList() {
  const hovered = useHoveredPin();
  useEffect(() => () => setHoveredPin(null), []);
  return (id: string) => ({ handlers: pinRowHover(id), hover: hovered === id ? ROW_HOVER : "" });
}

/** A row of a pin: its pointer handlers and, while its pin or the row is hovered, the outline class. A row that goes away on a hover lets go of it. */
export function usePinRow(id: string | null) {
  const hovered = useHoveredPin();
  useEffect(
    () => () => {
      if (id && getHoveredPin() === id) setHoveredPin(null);
    },
    [id]
  );
  return {
    handlers: id ? pinRowHover(id) : {},
    hover: id && hovered === id ? ROW_HOVER : "",
  };
}
