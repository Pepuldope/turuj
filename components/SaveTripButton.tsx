"use client";

import { useTripStops } from "@/lib/tripStops";
import { useState } from "react";
import type { BBox, LatLng } from "@/lib/types";
import type { TripProfile } from "@/lib/tripProfile";
import { offlineMapUrls } from "@/lib/tiles";
import { dayAfterNa } from "@/lib/days";
import { useSavedTrips } from "@/lib/savedTrips";
import type { SavedTrail } from "@/lib/savedTrips";
import { useInstalled } from "@/lib/installApp";
import { useTripSettings } from "@/lib/tripSettings";
import type { TripPlan } from "@/lib/useTripPlan";
import { useUserLocation } from "@/lib/userLocation";
import { sinceArrival, track } from "@/lib/analytics";
import { ShareButton } from "@/components/ShareButton";
import { HeardFrom } from "@/components/HeardFrom";
import type { ShareInfo } from "@/components/ShareButton";

import { LangLink, useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";
interface Props extends ShareInfo {
  gpxUrl: string | null;
  bbox: BBox | null;
  sun: LatLng | null;
  /** The trip page's plan (with real train times), so the saved and shared day match what the page shows. */
  tripPlan: TripPlan;
  profile: TripProfile | null;
  /** The walk, kept with the saved trip for the trail screen. */
  trail?: SavedTrail;
}

type Status = "idle" | "saving" | "error";

/** Build assets this page is running on, so the offline copy can still hydrate. */
function loadedAssetUrls(): string[] {
  return performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => new URL(u).pathname.startsWith("/_next/static/"));
}

/** A few missing map tiles leave gaps; more than this share and the offline map isn't worth the name. */
const MAX_MISSING_SHARE = 0.1;

/**
 * Ask the service worker to store these URLs. Fails when one of `required` (the page, the GPX)
 * or too many of the rest could not be stored, so the page never says "works without signal" wrongly.
 */
async function cacheTrip(slug: string, urls: string[], required: string[], onProgress: (done: number, total: number) => void) {
  // Never resolves when the service worker failed to register: give up instead of saving forever.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("no service worker")), 10000)),
  ]);
  const channel = new MessageChannel();
  const done = new Promise<void>((resolve, reject) => {
    channel.port1.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "PROGRESS") onProgress(msg.done, msg.total);
      if (msg.type === "DONE") {
        const failed: string[] = msg.failed ?? [];
        if (failed.some((u) => required.includes(u)) || failed.length > MAX_MISSING_SHARE * urls.length) reject(new Error("incomplete"));
        else resolve();
      }
    };
    setTimeout(() => reject(new Error("timeout")), 120000);
  });
  reg.active?.postMessage({ type: "CACHE_TRIP", slug, urls }, [channel.port2]);
  await done;
}

const primary =
  "w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-base font-bold text-[var(--accent-contrast)] disabled:opacity-60";
const secondary =
  "rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent)] disabled:opacity-60";

/**
 * "Uložiť výlet" is the main button (PD2): it remembers the trip on this
 * device and stores it for offline use. Right after saving, one tap offers to
 * send the plan to the group.
 */
export function SaveTripButton({ gpxUrl, bbox, sun, tripPlan, profile, trail, ...trip }: Props) {
  const { slug, name } = trip;
  const { trips, save, patch, remove } = useSavedTrips();
  const { start } = useUserLocation();
  const { travel } = useTripSettings();
  const { plan, date, time, hikeMin, driveMin, route, transit, fixed, withKids, loading } = tripPlan;
  const { stops } = useTripStops(slug);
  const t = useT();
  const installed = useInstalled();
  const lang = useLang();
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [askShare, setAskShare] = useState(false);
  // The first trip saved on this device: ask once how they heard of us (after the share offer).
  const [askHeard, setAskHeard] = useState(false);

  const saved = trips.find((t) => t.slug === slug) ?? null;
  const changed =
    saved !== null &&
    (saved.date !== date ||
      saved.time !== time ||
      (saved.start?.label ?? null) !== (start?.label ?? null) ||
      (saved.transit ?? false) !== transit ||
      (saved.withKids ?? false) !== withKids ||
      saved.hikeMin !== hikeMin);

  async function onSave() {
    // While the drive or the trains load, the plan is still missing them: saving now would keep a wrong day.
    if (!date || !time || !sun || loading) return;
    setStatus("saving");
    track("trip_saved", { trail: slug, took: sinceArrival() });
    if (trips.length === 0) setAskHeard(true);
    save({
      slug,
      name,
      date,
      time,
      start: start ? { lat: start.lat, lon: start.lon, label: start.label } : null,
      driveMin,
      hikeMin,
      travel,
      transit,
      withKids,
      fixed,
      sun,
      profile,
      stops,
      trail,
      savedAt: new Date().toISOString(),
      offline: "pending",
    });
    setAskShare(true);

    if (!("serviceWorker" in navigator)) {
      patch(slug, { offline: "failed" });
      setStatus("idle");
      return;
    }
    const required = [langPath(lang, `/trasa/${slug}`), ...(gpxUrl ? [gpxUrl] : [])];
    const mapUrls = bbox ? await offlineMapUrls(bbox) : [];
    const urls = [...required, ...loadedAssetUrls(), ...mapUrls];
    // The map style and its TileJSON (the URLs without a file extension): without them there is no offline map at all.
    const mapCore = mapUrls.filter((u) => !/\.[a-z0-9]+$/i.test(new URL(u, window.location.origin).pathname));
    try {
      await cacheTrip(slug, urls, [...required, ...mapCore], (d, t) => setProgress({ done: d, total: t }));
      // The map's style couldn't be read (no signal, map service down): the page and GPX are kept, but no map.
      if (bbox && mapUrls.length === 0) throw new Error("no map");
      patch(slug, { offline: "ok" });
      setStatus("idle");
    } catch {
      patch(slug, { offline: "failed" });
      setStatus("error");
    }
  }

  // "pending" while this page isn't saving: the save was cut off (page closed, phone asleep).
  const showButton = !saved || changed || saved.offline === "failed" || saved.offline === "pending" || status === "saving";
  const share = (
    <ShareButton
      {...trip}
      plan={loading ? null : plan}
      date={date}
      time={time}
      hikeMin={hikeMin}
      hasDrive={route !== null || driveMin !== null}
      className={secondary}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {showButton && (
        <button type="button" onClick={onSave} disabled={status === "saving" || !date || !time || loading} className={primary}>
          {status === "saving"
            ? t("Ukladám aj na cestu bez signálu... ({done}/{total})", { done: progress.done, total: progress.total || "?" })
            : saved
              ? t("Uložiť zmeny")
              : t("Uložiť výlet")}
        </button>
      )}

      {saved && askShare && (
        <div role="status" className="flex flex-col gap-2 rounded-xl bg-[var(--ok-bg)] p-3 text-sm">
          <p>
            <strong>{t("Uložené.")}</strong> {t("Nájdete to v")}{" "}
            <LangLink href="/ulozene" className="underline">
              {t("Mojich výletoch")}
            </LangLink>
            .
          </p>
          <p className="font-semibold">{t("Zdieľať výlet?")}</p>
          <div className="flex flex-wrap gap-2">
            <ShareButton
              {...trip}
              plan={loading ? null : plan}
              date={date}
              time={time}
              hikeMin={hikeMin}
              hasDrive={route !== null || driveMin !== null}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent-contrast)]"
              onShared={() => setAskShare(false)}
            />
            <button type="button" onClick={() => setAskShare(false)} className="px-2 text-sm underline">
              {t("Teraz nie")}
            </button>
          </div>
        </div>
      )}

      {saved && askHeard && !askShare && <HeardFrom onDone={() => setAskHeard(false)} />}

      {saved && !askShare && status !== "saving" && (
        <p className="text-sm">
          {t("Uložené na")} <strong>{dayAfterNa(saved.date, lang)}</strong> {t("o")} <strong>{saved.time}</strong>
          {saved.offline === "ok" ? t(", funguje aj bez signálu. ") : ". "}
          <button type="button" onClick={() => remove(slug)} className="text-[var(--muted)] underline">
            {t("Odstrániť")}
          </button>
        </p>
      )}

      {status === "error" && (
        <p className="text-sm text-[var(--warn)]">
          {t("Výlet je uložený, ale kópia bez signálu sa nepodarila. Skúste to znova so signálom.")}
        </p>
      )}

      {!askShare && share}

      {status !== "saving" && !installed && (
        <div className="flex items-center gap-3 rounded-xl bg-[var(--sun-soft)] p-3 text-sm">
          <span className="min-w-0 flex-1">{t("Hore na kopci bez signálu? Uložený výlet otvoríte najrýchlejšie z ikony na ploche.")}</span>
          <LangLink
            href="/aplikacia"
            onClick={() => track("app_link", { from: "saved" })}
            className="shrink-0 rounded-[var(--radius-chip)] bg-[var(--accent)] px-3 py-2 font-bold whitespace-nowrap text-[var(--accent-contrast)]"
          >
            {t("Získať appku")}
          </LangLink>
        </div>
      )}
    </div>
  );
}
