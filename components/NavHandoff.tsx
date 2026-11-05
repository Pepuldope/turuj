"use client";

import { useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";
import { googleMapsUrl, googleWalkUrl, mapyUrl, mapyWalkUrl } from "@/lib/links";
import type { WalkRoute } from "@/lib/links";
import type { LatLng } from "@/lib/types";
import { useTripAccess } from "@/components/TripAccess";
import { useUserLocation } from "@/lib/userLocation";
import "@/lib/legacyStorage";
import { useT } from "@/lib/i18n";

type App = "google" | "mapy";

// The visitor's maps app, remembered in this browser for every trip.
const KEY = "turuj-maps-app";
const EVENT = "turuj-maps-app";

function readApp(): App {
  try {
    return localStorage.getItem(KEY) === "mapy" ? "mapy" : "google";
  } catch {
    return "google";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function pickApp(app: App) {
  try {
    localStorage.setItem(KEY, app);
  } catch {
    // Storage blocked: the pick lasts until the next render only.
  }
  window.dispatchEvent(new Event(EVENT));
}

const segBtn = (on: boolean) =>
  `rounded-[10px] px-2 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
    on ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
  }`;

const navButton =
  "flex-1 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2.5 text-center text-sm font-semibold hover:border-[var(--accent)]";

/**
 * Hand-off to a maps app in two legs, because one Google Maps link carries one travel
 * mode: drive to the parking, then walk the trail from the car (or the stop).
 */
export function NavHandoff({
  drive,
  start,
  walkFrom,
  walk,
  join,
}: {
  /** Where the drive ends; null by train or bus (the timetable block hands that off). */
  drive: LatLng | null;
  start: LatLng | null;
  walkFrom: LatLng | null;
  walk: WalkRoute;
  join: LatLng | null;
}) {
  // A typed or picked start goes to Google as the origin; a GPS start is left out, so Google
  // navigates from wherever the phone is then (Peter, 2026-11-05: it always used "your location").
  const typed = useUserLocation().start?.source === "manual";
  // Without a parking lot the drive ends on the nearest road, not at a parking.
  const { parking } = useTripAccess();
  const t = useT();
  const app = useSyncExternalStore(subscribe, readApp, () => "google" as App);
  const canWalk = walkFrom !== null && walk.points.length > 1;
  if (!drive && !canWalk) return null;
  const google = app === "google";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{t("Navigovať v")}</span>
        <div role="group" aria-label={t("Mapy na navigáciu")} className="grid grid-cols-2 gap-[3px] rounded-xl bg-[var(--segment-bg)] p-[3px]">
          <button type="button" aria-pressed={google} onClick={() => pickApp("google")} className={segBtn(google)}>
            Google
          </button>
          <button type="button" aria-pressed={!google} onClick={() => pickApp("mapy")} className={segBtn(!google)}>
            Mapy.com
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        {drive && (
          <a
            href={google ? googleMapsUrl(drive, typed ? start : null) : mapyUrl(drive, start)}
            // Through track(), so our own counter (/statistiky, the monthly report) gets it too, not only Umami.
            onClick={() => track("nav_open", { app })}
            target="_blank"
            rel="noopener noreferrer"
            className={navButton}
          >
            {parking ? t("Na parkovisko") : t("Navigovať autom")}
          </a>
        )}
        {canWalk && (
          <a
            href={google ? googleWalkUrl(walkFrom, walk, join) : mapyWalkUrl(walkFrom, walk, join)}
            onClick={() => track("nav_open", { app: `${app}-walk` })}
            target="_blank"
            rel="noopener noreferrer"
            className={navButton}
          >
            {t("Po trase")}
          </a>
        )}
      </div>
      {canWalk && (
        <p className="text-xs text-[var(--muted)]">
          {google
            ? t("Google vie po trase len 3 body a cestu medzi nimi si volí sám. Mapy.com idú po značených chodníkoch.")
            : t(walk.loop ? (drive ? "Po trase ide po značených chodníkoch celým okruhom k autu." : "Po trase ide po značených chodníkoch celým okruhom k zastávke.") : drive ? "Po trase ide po značených chodníkoch hore aj späť k autu." : "Po trase ide po značených chodníkoch hore aj späť k zastávke.")}
        </p>
      )}
    </div>
  );
}
