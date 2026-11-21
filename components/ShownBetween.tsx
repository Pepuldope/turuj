"use client";

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { inYearlyRange, todayMonthDay } from "@/lib/closedToday";

const noop = () => () => {};

/**
 * Seasonal content on a page that is built once: it is in the HTML, and the browser takes it out when
 * today's Slovak date is outside `from`..`to` ("MM-DD", may wrap the new year). So a page built in the
 * season stops showing it the day after, without waiting for the next build.
 */
export function ShownBetween({ from, to, children }: { from: string; to: string; children: ReactNode }) {
  const today = useSyncExternalStore(noop, () => todayMonthDay(), () => null);
  if (today !== null && !inYearlyRange(from, to, today)) return null;
  return <>{children}</>;
}
