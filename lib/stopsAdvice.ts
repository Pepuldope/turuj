// Peter, 12 Nov 2026: when the chosen stops are what push the walk past sunset, the Zastávky step says so
// and offers two ways out. The sums are done here, from the plan's own times, never guessed in the UI.

const MIN = 60000;

export interface AdviceStop {
  id: string;
  name: string;
  /** Minutes the stop adds to the day (already times the visits). */
  minutes: number;
}

export interface StopsAdvice {
  /** Minutes the stops added to the walk. */
  stopMin: number;
  /** Remove this one stop: the walk then ends at `backAt`. */
  removal: { id: string; name: string; backAt: Date } | null;
  /** Start the walk at `start` (on a 5-minute mark) and it ends at `backAt`; null when that is before sunrise. */
  earlier: { start: Date; backAt: Date } | null;
}

/**
 * Null unless the stops are the reason for coming back after dark: the walk ends after sunset, but would
 * end by sunset without them. (Late back for another reason is the day plan's own warning, not ours.)
 */
export function stopsAdvice(
  plan: { hikeStart: Date; hikeEnd: Date; sunrise: Date; sunset: Date },
  stops: AdviceStop[],
): StopsAdvice | null {
  const stopMin = stops.reduce((sum, s) => sum + s.minutes, 0);
  if (stopMin <= 0 || plan.hikeEnd <= plan.sunset) return null;
  if (plan.hikeEnd.getTime() - stopMin * MIN > plan.sunset.getTime()) return null;

  // The stop whose removal alone gets us back by sunset: the cheapest such one. None alone does it:
  // the biggest one, which gets closest (its "späť" shows the time anyway).
  const back = (s: AdviceStop) => new Date(plan.hikeEnd.getTime() - s.minutes * MIN);
  const enough = stops.filter((s) => s.minutes > 0 && back(s) <= plan.sunset);
  const pick = enough.length
    ? enough.reduce((a, b) => (b.minutes < a.minutes ? b : a))
    : stops.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const removal = { id: pick.id, name: pick.name, backAt: back(pick) };

  // Earlier start by exactly what is late, then down to the 5 minutes (Slovak offsets are whole 5-minute multiples).
  const lateMs = plan.hikeEnd.getTime() - plan.sunset.getTime();
  const start = new Date(Math.floor((plan.hikeStart.getTime() - lateMs) / (5 * MIN)) * 5 * MIN);
  const earlier =
    start < plan.sunrise
      ? null
      : { start, backAt: new Date(plan.hikeEnd.getTime() - (plan.hikeStart.getTime() - start.getTime())) };

  return { stopMin, removal, earlier };
}
