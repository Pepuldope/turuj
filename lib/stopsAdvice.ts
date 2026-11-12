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
  /** Remove these stops (one if that is enough, else the fewest that are): the walk then ends at `backAt`. Null if even all of them would not do. */
  removal: { ids: string[]; names: string[]; backAt: Date } | null;
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

  // One stop whose removal alone gets us back by sunset: the cheapest such one. None alone does it: the
  // fewest stops that do, biggest first (Peter 12 Nov 2026: a "way out" that is still after sunset is none).
  const endWithout = (gone: AdviceStop[]) =>
    new Date(plan.hikeEnd.getTime() - gone.reduce((sum, s) => sum + s.minutes, 0) * MIN);
  const enough = stops.filter((s) => s.minutes > 0 && endWithout([s]) <= plan.sunset);
  let gone: AdviceStop[] = [];
  if (enough.length) {
    gone = [enough.reduce((a, b) => (b.minutes < a.minutes ? b : a))];
  } else {
    const biggestFirst = [...stops].filter((s) => s.minutes > 0).sort((a, b) => b.minutes - a.minutes);
    for (const s of biggestFirst) {
      gone.push(s);
      if (endWithout(gone) <= plan.sunset) break;
    }
    if (endWithout(gone) > plan.sunset) gone = [];
  }
  const removal = gone.length ? { ids: gone.map((s) => s.id), names: gone.map((s) => s.name), backAt: endWithout(gone) } : null;

  // Earlier start by exactly what is late, then down to the 5 minutes (Slovak offsets are whole 5-minute multiples).
  const lateMs = plan.hikeEnd.getTime() - plan.sunset.getTime();
  const start = new Date(Math.floor((plan.hikeStart.getTime() - lateMs) / (5 * MIN)) * 5 * MIN);
  const earlier =
    start < plan.sunrise
      ? null
      : { start, backAt: new Date(plan.hikeEnd.getTime() - (plan.hikeStart.getTime() - start.getTime())) };

  return { stopMin, removal, earlier };
}
