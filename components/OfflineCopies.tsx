"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isoDate } from "@/lib/days";
import { langOfPath, langPath } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { makeOfflineCopy, pageBuildFiles } from "@/lib/offlineCopy";
import { readSavedTrips, useSavedTrips } from "@/lib/savedTrips";
import type { SavedTrip } from "@/lib/savedTrips";

const START_DELAY_MS = 3000;

// Module level, because the component could mount twice: one copy at a time, and a trip that failed is left for the next page load.
let running = false;
const failedSlugs = new Set<string>();

/** Whether this device may spend data on a background copy right now. */
function allowed(): boolean {
  return "serviceWorker" in navigator && navigator.onLine !== false && (navigator as { connection?: { saveData?: boolean } }).connection?.saveData !== true;
}

/**
 * Plans that arrived without an offline copy and are still ahead, soonest first. A plan saved before the trail's
 * map area was kept with it (no `trail.bbox`) is left alone: its copy would have no map, and the list must not
 * say "funguje bez signálu" for that. Saving it again on its page makes the full copy.
 */
function candidates(trips: SavedTrip[]): SavedTrip[] {
  const today = isoDate(new Date());
  return trips.filter((t) => t.offline === "none" && !t.doneAt && t.date >= today && !!t.trail?.bbox && !failedSlugs.has(t.slug)).sort((a, b) => a.date.localeCompare(b.date));
}

async function copyAll(lang: Lang, patch: (slug: string, change: Partial<SavedTrip>) => void) {
  if (running) return;
  running = true;
  try {
    for (let trip = candidates(readSavedTrips())[0]; trip && allowed(); trip = candidates(readSavedTrips())[0]) {
      try {
        const pagePath = langPath(lang, `/trasa/${trip.slug}`);
        const found = await pageBuildFiles(pagePath);
        await makeOfflineCopy({ slug: trip.slug, pagePath, gpxUrl: trip.gpx ?? found.gpxUrl, bbox: trip.trail?.bbox ?? null, assets: found.assets });
        // The plan may have been removed or saved by hand while the copy was made.
        if (readSavedTrips().find((t) => t.slug === trip.slug)?.offline === "none") patch(trip.slug, { offline: "ok" });
        else failedSlugs.add(trip.slug);
      } catch {
        failedSlugs.add(trip.slug);
      }
    }
  } finally {
    running = false;
  }
}

/** Makes the offline copy of every arrived plan by itself, one at a time, once the site is open with signal. Renders nothing. */
export function OfflineCopies() {
  const { trips, patch } = useSavedTrips();
  // This component sits above the language provider, so it reads the language from the address itself.
  const lang = langOfPath(usePathname());
  const waiting = candidates(trips).length > 0;

  useEffect(() => {
    if (!waiting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      clearTimeout(timer);
      if (allowed()) timer = setTimeout(() => void copyAll(lang, patch), START_DELAY_MS);
    };
    start();
    window.addEventListener("online", start);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", start);
    };
  }, [waiting, trips, lang, patch]);

  return null;
}
