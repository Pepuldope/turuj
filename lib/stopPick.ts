import { approachMin } from "@/lib/dayPlan";
import type { TransitMode } from "@/lib/types";

/** A bus that is within this share of the fastest train's total counts as "as fast": the bus is preferred. */
export const BUS_PREFERENCE = 1.1;

/** What a stop needs for ranking: its mode and the walk from it to the trail. */
export interface RankableStop {
  mode: TransitMode;
  join: { walk_m: number } | null;
  distance_m: number;
}

/** One stop's ride from the start, minutes (a timetable train is exact, the rest an estimate from the road time). */
export interface StopRide {
  rideMin: number;
  approx: boolean;
}

/** Door-to-door estimate of one stop: the ride plus the walk to the trail. */
export interface StopTotal {
  totalMin: number;
  approx: boolean;
}

export interface StopRanking {
  /** Indices into the input, the default first, the rest fastest first. */
  order: number[];
  /** Per input index; null when the rides are unknown (no start, or still loading). */
  totals: (StopTotal | null)[];
}

const isTrain = (s: RankableStop) => s.mode === "vlak";

/**
 * Orders the stops of a trip from the visitor's start, fastest door to trail first (the ride plus the walk from the stop).
 * `stops` come nearest-walk first and `rides` line up with them. Without rides (no start set, or still loading) the order
 * stays nearest walk first. The default (first) is the fastest stop, but a bus within BUS_PREFERENCE of a faster train beats it:
 * never a train that is much slower than a bus, and a tie goes to the bus.
 *
 * A station whose time is a guess has no train that day. When another stop has real train times (so the timetable does
 * cover the day), such a station goes after every stop with a known time, however short its guess: a guess must not
 * outrank a train that runs (Peter, 2026-11-25, C222). A bus is always a guess and keeps its place.
 */
export function rankStops(stops: readonly RankableStop[], rides: readonly (StopRide | null)[] | null): StopRanking {
  const identity = stops.map((_, i) => i);
  if (!rides) return { order: identity, totals: stops.map(() => null) };
  const totals = stops.map((s, i): StopTotal | null => {
    const r = rides[i];
    return r ? { totalMin: r.rideMin + approachMin(s.join?.walk_m ?? s.distance_m), approx: r.approx } : null;
  });
  const realTrain = totals.some((t) => t && !t.approx);
  // 0 = a known time, 1 = a station with no train that day while another stop has real trains, 2 = unknown.
  const group = (i: number) => (!totals[i] ? 2 : realTrain && isTrain(stops[i]) && totals[i]!.approx ? 1 : 0);
  // Stable sort: equal totals keep the nearest walk first; unknown totals go last.
  const order = [...identity].sort((a, b) => group(a) - group(b) || (totals[a]?.totalMin ?? Infinity) - (totals[b]?.totalMin ?? Infinity));
  const best = order[0];
  if (best !== undefined && totals[best] && isTrain(stops[best])) {
    const limit = totals[best]!.totalMin * BUS_PREFERENCE;
    const bus = order.find((i) => !isTrain(stops[i]) && totals[i] && totals[i]!.totalMin <= limit);
    if (bus !== undefined) {
      order.splice(order.indexOf(bus), 1);
      order.unshift(bus);
    }
  }
  return { order, totals };
}

/** Where in `order` the visitor's pick stands: their saved pick (an index into the input) if it exists, else the default (0). */
export function pickPosition(order: readonly number[], saved: number | null): number {
  if (saved === null) return 0;
  const at = order.indexOf(saved);
  return at < 0 ? 0 : at;
}
