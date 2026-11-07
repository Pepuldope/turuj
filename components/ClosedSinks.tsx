"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { inYearlyRange, todayMonthDay } from "@/lib/closedToday";

const noop = () => () => {};
/** Today's Slovak date in the browser; null while the page is still the cached HTML. */
const useToday = () => useSyncExternalStore(noop, () => todayMonthDay(), () => null);

/**
 * One tile of a town row. The page is built once in rank order; here the browser moves a trip whose
 * yearly closure covers today to the end of the row (flex `order`, same order among the rest). The
 * tile stays in the HTML and keeps its closure pill, nothing is hidden.
 */
export function ClosedSinks({ range, children }: { range: { from: string; to: string } | null; children: ReactNode }) {
  const today = useToday();
  const closed = today !== null && range !== null && inYearlyRange(range.from, range.to, today);
  return (
    <div className="flex-none snap-start" style={closed ? { order: 1 } : undefined}>
      {children}
    </div>
  );
}
