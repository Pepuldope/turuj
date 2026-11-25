// Dragging the start-time thumb on step 4's day track (components/KedyStep.tsx): how late the thumb may
// go, and when and how fast the track scrolls along while the thumb is held near its visible edge.
//
// Peter, 25 Nov 2026 (C221): "If you slide to the right too much, it starts bugging and teleporting all
// over the slider." Two causes, both measured on the live site:
// 1. With a ride before the walk, a departure late enough put the walk's start past midnight. The whole
//    plan then belonged to the next day, the track opened again at its left end, the time under the
//    finger became an afternoon one, the plan moved back, and so on: 23:55 and 14:30 in turns.
// 2. The track scrolled along whenever the thumb was within 48 px of an edge, at 480 px a second (23
//    hours of the scale a second). It opens with the thumb an hour from the left edge, so grabbing it
//    there scrolled left at once, even while the finger moved right.

/** The slider's step, minutes. */
const STEP = 5;
const DAY = 24 * 60;

/**
 * The latest minute of the day the thumb may be set to: the walk still starts on the same day, so a
 * ride of `leadMin` before it brings the latest departure that much before midnight.
 */
export function latestThumbMin(leadMin: number): number {
  const lead = Math.max(0, Math.ceil(leadMin));
  return Math.max(0, Math.floor((DAY - STEP - lead) / STEP) * STEP);
}

/** How near an edge of the visible track the thumb has to be for the track to scroll along, px. */
export const EDGE_ZONE = 48;
/** The thumb must have moved this far from where it was grabbed, toward that edge, px. */
const INTENT = 4;
/** Scrolling speed at the zone's rim and at the very edge, px a second. */
const SLOW = 40;
const FAST = 220;

/**
 * How fast the track should scroll while the thumb is held at `x`, px a second: negative to the left,
 * 0 for not at all. `from` is where the thumb was grabbed; `left` and `right` are the edges of the
 * track's visible part. It scrolls only toward an edge the thumb was dragged to, faster the deeper in.
 */
export function edgeScroll(x: number, from: number, left: number, right: number): number {
  const dir = x < from - INTENT ? -1 : x > from + INTENT ? 1 : 0;
  if (!dir) return 0;
  const depth = dir < 0 ? (left + EDGE_ZONE - x) / EDGE_ZONE : (x - (right - EDGE_ZONE)) / EDGE_ZONE;
  if (depth <= 0) return 0;
  return dir * (SLOW + (FAST - SLOW) * Math.min(1, depth));
}
