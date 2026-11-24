import type { GpxPoint } from "@/lib/gpx";
import type { LatLng } from "@/lib/types";

/**
 * C109 (Peter, 2026-11-24, option B): the GPX track stays the trail from its official start, as the
 * marked trail runs, but the download marks where the walk from the car park or the stop starts and
 * where it meets the trail, and a line under the button says why the page counts a different walk.
 */

type Tr = (sk: string, vars?: Record<string, string | number>) => string;

interface Place {
  name: string;
  location: LatLng;
}

export interface GpxMarksInput {
  /** On foot from the group's start: no car park or stop, nothing to mark. */
  walking: boolean;
  transit: boolean;
  parking: Place | null;
  stop: Place | null;
  trailStart: LatLng | null;
  /** Where the walk reaches the trail (its start, or a point up it). */
  trailJoin: LatLng | null;
  /** Joined up the trail: the stretch skipped (null = walks the whole trail). */
  skip: { skip_m: number } | null;
  /** Car park or stop to the trail, one way, minutes. */
  approachMin: number;
}

export interface GpxMarks {
  points: GpxPoint[];
  note: string | null;
}

const NONE: GpxMarks = { points: [], note: null };

export function gpxMarks(a: GpxMarksInput, t: Tr): GpxMarks {
  if (a.walking) return NONE;
  const from = a.transit ? a.stop : a.parking;
  if (!from) return NONE;
  const start: GpxPoint = {
    ...from.location,
    name: a.transit ? t("Zastávka: {name}", { name: from.name }) : t("Parkovisko: {name}", { name: from.name }),
  };

  if (a.skip && a.trailJoin) {
    const joinNote = a.transit
      ? t("Súbor GPX je celá trasa od jej začiatku. Od zastávky sa na ňu napojíte v bode „Napojenie na trasu“.")
      : t("Súbor GPX je celá trasa od jej začiatku. Od parkoviska sa na ňu napojíte v bode „Napojenie na trasu“.");
    const shorter = a.skip.skip_m > 0 ? ` ${t("Úsek pred týmto bodom stránka do chôdze nepočíta.")}` : "";
    return { points: [start, { ...a.trailJoin, name: t("Napojenie na trasu") }], note: joinNote + shorter };
  }

  if (a.approachMin > 0 && a.trailStart) {
    const note = a.transit
      ? t("Súbor GPX začína na začiatku trasy, {min} min chôdze od zastávky. Zastávka je v ňom vyznačená ako bod.", { min: a.approachMin })
      : t("Súbor GPX začína na začiatku trasy, {min} min chôdze od parkoviska. Parkovisko je v ňom vyznačené ako bod.", { min: a.approachMin });
    return { points: [start, { ...a.trailStart, name: t("Začiatok trasy") }], note };
  }

  // The car park or stop is at the start: marked, nothing to explain.
  return { points: [start], note: null };
}
