"use client";

import { useEffect, useRef } from "react";

/**
 * Marks today's month in the server-rendered month list: it finds the row whose data-months (space-separated, a merged closed row lists all its months) has it inside its
 * parent and sets data-now. Nothing is rendered or changed in React's tree, so the server HTML is
 * the same for every visitor and the highlight appears right after hydration.
 */
export function CurrentMonth() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const month = new Date().getMonth() + 1;
    const row = ref.current?.parentElement?.querySelector<HTMLElement>(`[data-months~="${month}"]`);
    row?.setAttribute("data-now", "true");
    row?.setAttribute("aria-current", "date");
  }, []);
  return <span ref={ref} hidden />;
}
