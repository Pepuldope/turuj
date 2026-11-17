"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/motion";

/**
 * Keeps something in the page while it animates out (Peter, 17 Nov: menus, sheets and dialogs vanished the moment
 * they were closed). `mounted` is true while open and for `closeMs` after closing; `state` goes into `data-state`
 * on the element, and the `.pres-*` rules at the end of app/globals.css animate the two states. With reduced
 * motion nothing is kept: closing removes it at once and the open state only fades in.
 */
export function usePresence(open: boolean, closeMs = 220) {
  const [kept, setKept] = useState(open);
  // Set while rendering, not in an effect, so the first frame of opening is already in the page.
  if (open && !kept) setKept(true);
  useEffect(() => {
    if (open) return;
    const later = setTimeout(() => setKept(false), reducedMotion() ? 0 : closeMs + 30);
    return () => clearTimeout(later);
  }, [open, closeMs]);
  return { mounted: open || kept, state: open ? ("open" as const) : ("closed" as const) };
}

/**
 * For a dialog that its parent mounts and unmounts itself: `leave(action)` first plays the closing (`closing` goes
 * into `data-state`), then runs `action` (what the parent does to remove it). With reduced motion it runs at once.
 */
export function useLeave(ms = 230) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const leave = useCallback(
    (action: () => void) => {
      if (timer.current) return;
      if (reducedMotion()) return action();
      setClosing(true);
      timer.current = setTimeout(action, ms);
    },
    [ms],
  );
  return { state: closing ? ("closed" as const) : ("open" as const), leave };
}
