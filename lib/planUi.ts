// The trip page's plan card (which steps are open) survives a soft navigation between the routes of
// one place: each route has its own page (and URL), but picking one must not fold the steps or move
// the visitor. A module-level store is enough, a client-side navigation keeps the page's JavaScript.

const STAY_MS = 8000;

let openSteps: Record<string, boolean> | null = null;
let picked: { at: number; from: string; top: number } | null = null;

/** The provider reports its open steps on every change. */
export function rememberOpenSteps(open: Record<string, boolean>) {
  openSteps = open;
}

/** A route was just chosen in the route step (the click that is about to navigate). */
export function markRoutePicked(from: string, top: number) {
  picked = { at: Date.now(), from, top };
}

/** Where the route step's top edge stood in the window when the route was picked (null: not right after a pick). */
export function pickedAnchor(): number | null {
  return justPickedRoute() ? picked!.top : null;
}

/** True for a moment after a route pick: the new page opens the way the old one was left. */
export function justPickedRoute(): boolean {
  return picked !== null && Date.now() - picked.at < STAY_MS;
}

/** The steps open on the page just left, only right after a route pick. */
export function stepsKeptFromRoutePick(): Record<string, boolean> | null {
  return justPickedRoute() ? openSteps : null;
}
