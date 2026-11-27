// The two counts on the home page's "Moje výlety" strip. They match the two lists of Moje výlety: "Plánované" lists the
// saved trips not marked done (components/SavedTripsList.tsx), "Navštívené" one row per visited place (lib/visitedList.ts).
import { pluralClass } from "@/lib/closedToday";
import { visitedPlaces } from "@/lib/visitedList";
import type { Visit } from "@/lib/visits";
import type { SavedTrip } from "@/lib/savedTrips";

const PLANNED = { one: "plánovaný", few: "plánované", many: "plánovaných" } as const;
const VISITED = { one: "navštívený", few: "navštívené", many: "navštívených" } as const;

export interface MyTripsCounts {
  planned: number;
  visited: number;
}

export function myTripsCounts(trips: readonly Pick<SavedTrip, "doneAt">[], visits: readonly Visit[]): MyTripsCounts {
  return { planned: trips.filter((t) => !t.doneAt).length, visited: visitedPlaces(visits).length };
}

/** The strip's parts, a zero left out: the number and its Slovak word in the right plural form (the English word has a dictionary entry per form). */
export function myTripsParts({ planned, visited }: MyTripsCounts): { n: number; word: string }[] {
  return [
    ...(planned > 0 ? [{ n: planned, word: PLANNED[pluralClass(planned)] }] : []),
    ...(visited > 0 ? [{ n: visited, word: VISITED[pluralClass(visited)] }] : []),
  ];
}
