import { activeClosures } from "@/lib/closures";
import { wallClock } from "@/lib/zoned";
import type { TrailDetail } from "@/lib/types";

/** Today's Slovak calendar date, YYYY-MM-DD. */
export function todayIso(at: Date = new Date()): string {
  const { y, mo, d } = wallClock(at);
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Trips closed on `today` move below the open ones in the page the server draws (the browser does the
 * same once it knows the day). Stable: both groups keep their order; nothing is hidden.
 */
export function closedLast<T extends Pick<TrailDetail, "closures">>(trails: T[], today: string = todayIso()): T[] {
  const closed = (t: T) => activeClosures(t.closures, today).length > 0;
  return [...trails.filter((t) => !closed(t)), ...trails.filter(closed)];
}
