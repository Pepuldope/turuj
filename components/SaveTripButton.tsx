"use client";

import { Reveal } from "@/components/Reveal";
import { UiIcon } from "@/components/UiIcon";
import { APP_BAR_KEY } from "@/components/AppBar";
import { useTripStops } from "@/lib/tripStops";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { BBox, Closure, LatLng } from "@/lib/types";
import type { TripProfile } from "@/lib/tripProfile";
import { makeOfflineCopy, pageBuildFiles } from "@/lib/offlineCopy";
import { newPlanKey, planKey, useSavedTrips } from "@/lib/savedTrips";
import { openedPlanKey } from "@/lib/openPlan";
import { nextPlan } from "@/lib/nextPlan";
import type { SavedTrail, SavedTrip } from "@/lib/savedTrips";
import { useInstalled } from "@/lib/installApp";
import { useTripSettings } from "@/lib/tripSettings";
import type { TripPlan } from "@/lib/useTripPlan";
import { useUserLocation } from "@/lib/userLocation";
import { sinceArrival, track } from "@/lib/analytics";
import { ShareButton } from "@/components/ShareButton";
import { activeClosures } from "@/lib/closures";
import { ClosureGuard } from "@/components/ClosureGuard";
import { HeardFrom } from "@/components/HeardFrom";
import { EveReminder } from "@/components/EveReminder";
import type { ShareInfo } from "@/components/ShareButton";
import type { TripWeather } from "@/components/WeatherBlock";
import { forecastForDay, mergeForecast } from "@/lib/weather";

import { shortDate } from "@/lib/days";
import { planDay } from "@/lib/nextPlan";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";
/** What saving a trip needs from its page. */
interface SaveInput {
  slug: string;
  /** The main trip's slug of the place, and the route as step 1 names it (the slug, or `<slug>/okruh` on the loop page); kept so a visit knows both. */
  place?: string;
  route?: string;
  name: string;
  gpxUrl: string | null;
  bbox: BBox | null;
  sun: LatLng | null;
  /** The trip page's plan (with real train times), so the saved and shared day match what the page shows. */
  tripPlan: TripPlan;
  profile: TripProfile | null;
  /** The walk, kept with the saved trip for the trail screen. */
  trail?: SavedTrail;
  /** The trail's closure rules, for the evening-before reminder (empty when none is known). */
  closures?: Closure[];
  /** The trip page's forecast: the trip day's part is kept with the saved trip, so its card shows the weather offline. */
  weather?: TripWeather | null;
}

/** Where on the page the save was tapped: the save block of the day card, or the box of a friend's shared plan. */
type SaveFrom = "card" | "shared";

interface Props {
  sun: LatLng | null;
  tripPlan: TripPlan;
  closures?: Closure[];
  /** The page's one save (useTripSave), shared with the box of a friend's plan. */
  saving: TripSave;
  /** Where the walk starts (parking, stop or trailhead), as the calendar event's place. */
  where?: { name: string; location: LatLng } | null;
}

interface HandoffProps extends ShareInfo {
  tripPlan: TripPlan;
  closures?: Closure[];
  /** The navigation buttons. */
  nav?: ReactNode;
  /** The GPX download, the last action of the card. */
  gpx?: ReactNode;
}

type Status = "idle" | "saving" | "error";

/** Build assets this page is running on, so the offline copy can still hydrate. */
function loadedAssetUrls(): string[] {
  return performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => new URL(u).pathname.startsWith("/_next/static/"));
}

const primary =
  "w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-base font-bold text-[var(--accent-contrast)] disabled:opacity-60";
const secondary =
  "rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent)] disabled:opacity-60";

/**
 * Saving one trip, once per trip page: the page has two places to tap it (the save block at the end of the day card and,
 * on a friend's shared link, the box at the top; C91), and both show the same progress and result.
 */
export function useTripSave({ slug, place, route, name, gpxUrl, bbox, sun, tripPlan, profile, trail, closures = [], weather = null }: SaveInput) {
  const { trips, save, patch, remove } = useSavedTrips();
  const { start } = useUserLocation();
  const { travel, today } = useTripSettings();
  const { date, time, hikeMin, driveMin, transit, fixed, withKids, loading } = tripPlan;
  const { stops } = useTripStops(slug);
  const lang = useLang();
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Right after saving, the green box asks about the evening-before reminder (Peter, 18 Nov: the switch further down
  // wasn't seen); sharing is the plain button under it. It asks where the save was tapped.
  const [askEve, setAskEve] = useState<SaveFrom | null>(null);
  // The two boxes under the button swap by rolling (Peter, 17 Nov), but only after the visitor pressed something: a saved
  // trip is read from storage right after hydration, and that is not an event.
  const [touched, setTouched] = useState(false);
  // The first trip saved on this device: ask once how they heard of us (after the share offer).
  const [askHeard, setAskHeard] = useState(false);

  // A route can hold several plans (C235, Peter's pick B, 27 Nov 2026): the day picked on the page decides which one
  // this is. The same day changes that plan; another day saves one more, and the other plans stay.
  const own = trips.filter((t) => t.slug === slug);
  const saved = (date ? own.find((t) => t.date === date) : undefined) ?? null;
  // The plan "Radšej ho presunúť sem" moves: the one opened from Moje výlety or the plan row, else the nearest ahead, else the newest.
  const opened = openedPlanKey();
  const others = own.filter((t) => t !== saved);
  const movable = saved ? null : (others.find((t) => planKey(t) === opened) ?? (today ? nextPlan(others, today) : null) ?? others[0] ?? null);
  // A closed day: Save steps back to the secondary look; the one primary button is "Nájsť iný výlet" in the red closure box.
  const closedDay = date !== null && activeClosures(closures, date).length > 0;
  const changed =
    saved !== null &&
    (saved.date !== date ||
      saved.time !== time ||
      (saved.start?.label ?? null) !== (start?.label ?? null) ||
      (saved.transit ?? false) !== transit ||
      (saved.withKids ?? false) !== withKids ||
      saved.hikeMin !== hikeMin);

  async function onSave(from: SaveFrom = "card", move = false) {
    setTouched(true);
    // While the drive or the trains load, the plan is still missing them: saving now would keep a wrong day.
    if (!date || !time || !sun || loading) return;
    setStatus("saving");
    track("trip_saved", { trail: slug, took: sinceArrival(), ...(from === "shared" ? { from } : {}), ...(move ? { how: "move" } : movable ? { how: "another" } : {}) });
    // The plan this save writes: the one for this day, the one being moved here, or a new one beside the others.
    const base = saved ?? (move ? movable : null);
    const key = base ? base.key : own.some((t) => planKey(t) === slug) ? newPlanKey(slug, own.map(planKey)) : undefined;
    const thisKey = key ?? slug;
    if (trips.length === 0) setAskHeard(true);
    // The kept forecast counts only for the same day and the same place.
    const keep = base?.date === date && base.weather?.url === weather?.urls?.below ? base.weather : null;
    save({
      slug,
      ...(key ? { key } : {}),
      place,
      route,
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
      gpx: gpxUrl,
      closures,
      eve: base?.eve,
      weather: weather?.urls
        ? {
            url: weather.urls.below,
            topUrl: weather.urls.above,
            // Saved again for the same day: the hours already gone stay from the kept copy (lib/weather.ts mergeForecast).
            below: weather.below ? mergeForecast(keep?.below, forecastForDay(weather.below, date)) : (keep?.below ?? null),
            above: weather.below && weather.above ? mergeForecast(keep?.above, forecastForDay(weather.above, date)) : (keep?.above ?? null),
            at: weather.below ? new Date().toISOString() : (keep?.at ?? null),
          }
        : base?.date === date ? base.weather : undefined,
      savedAt: new Date().toISOString(),
      offline: "pending",
    });
    setAskEve(from);

    if (!("serviceWorker" in navigator)) {
      patch(thisKey, { offline: "failed" });
      setStatus("idle");
      return;
    }
    try {
      const pagePath = langPath(lang, `/trasa/${slug}`);
      // What the page has loaded so far misses the map's code when save is tapped before the map came into view
      // (the box on a shared link, a quick tap): with no signal the saved page then broke at the map. So the copy
      // also takes every build file the page names. If that list can't be read, it is as before.
      const named = await pageBuildFiles(pagePath).then((f) => f.assets, () => [] as string[]);
      const assets = [...new Set([...loadedAssetUrls(), ...named].map((u) => new URL(u, window.location.origin).href))];
      await makeOfflineCopy({ slug, pagePath, gpxUrl, bbox, assets, onProgress: (d, t) => setProgress({ done: d, total: t }) });
      patch(thisKey, { offline: "ok" });
      setStatus("idle");
    } catch {
      patch(thisKey, { offline: "failed" });
      setStatus("error");
    }
  }

  return {
    saved,
    changed,
    /** How many plans this route has (this day's included). */
    plans: own.length,
    closedDay,
    status,
    progress,
    askEve,
    askHeard,
    touched,
    /** Saving can't start yet: no day or time, or the drive or the trains are still loading. */
    notReady: !date || !time || loading,
    onSave,
    patch: (change: Partial<SavedTrip>) => {
      if (saved) patch(planKey(saved), change);
    },
    remove: () => {
      setTouched(true);
      if (saved) remove(planKey(saved));
    },
    /** Another plan of this route that "Radšej ho presunúť sem" would move to the picked day; null when this day has its plan. */
    movable,
    doneAskEve: () => setAskEve(null),
    doneAskHeard: () => setAskHeard(false),
  };
}

export type TripSave = ReturnType<typeof useTripSave>;

/**
 * The save block at the end of the day card (Peter's pick, 26 Nov 2026). "Uložiť výlet" is the main button (PD2): it
 * remembers the trip on this device and stores it for offline use. Top to bottom: the trail-status line (always
 * directly above), the button, the green "Uložené" block with the way to Moje výlety, the reminder question,
 * then HeardFrom and the error line, and the reminder switch.
 */
export function SaveTripButton({ sun, tripPlan, closures = [], saving, where = null }: Props) {
  const { plan, date } = tripPlan;
  const { saved, changed, closedDay, status, progress, askHeard, touched, onSave, patch, remove } = saving;
  // The reminder question shows where the save was tapped: here, or in the box of a friend's plan.
  const askEve = saving.askEve === "card";
  const t = useT();
  // Only the installed app says the saved trip works without signal (Peter, 25 Nov 2026): in a browser tab that promise
  // reads as if the website needed no internet. The copy is made either way, and Moje výlety shows its state.
  const installed = useInstalled();
  const lang = useLang();
  const { today } = useTripSettings();

  // "pending" while this page isn't saving: the save was cut off (page closed, phone asleep).
  const showButton = !saved || changed || saved.offline === "failed" || saved.offline === "pending" || saved.offline === "none" || status === "saving";
  const day = saved && today ? planDay(saved.date, today, lang) : null;

  const saveButton = (
        <button type="button" onClick={() => onSave()} disabled={status === "saving" || saving.notReady} className={closedDay ? `${secondary} min-h-11 w-full` : primary}>
          {status === "saving"
            ? t(installed ? "Ukladám aj na cestu bez signálu... ({done}/{total})" : "Ukladám... ({done}/{total})", { done: progress.done, total: progress.total || "?" })
            : saved
              ? t("Uložiť zmeny")
              : saving.movable && date
                ? t("Uložiť aj na {date}", { date: shortDate(date, lang) })
                : t("Uložiť výlet")}
        </button>
  );
  // Another plan of this route is on another day (C235, pick B): saving adds this day; one tap moves that plan here instead.
  const keepLine = saving.movable && status !== "saving" && (
    <p className="-mt-1 text-[13.5px] text-[var(--muted)]">
      {t("Plán na {date} zostane.", { date: shortDate(saving.movable.date, lang) })}{" "}
      <button
        type="button"
        onClick={() => onSave("card", true)}
        disabled={saving.notReady}
        className="font-semibold text-[var(--accent)] underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {t("Radšej ho presunúť sem")}
      </button>
    </p>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* A closed day says so right above the button or the saved block (the closure warning moves with Save). Without a closure nothing stands here: "Stav chodníka neoverený" has its own box near the top of the page (Peter, 27 Nov 2026: a grey line here looked like part of the button). */}
      <ClosureGuard closures={closures} date={date} />
      {showButton && !(saved && status === "saving") && saveButton}
      {showButton && !saved && keepLine}

      {/* Order: the green saved block, the reminder question under it, then the first-save question, the error, the switch. */}
      <Reveal open={!!saved && (askEve || status !== "saving")} className="roll-flex-gap" appear animate={touched}>
        {saved && (
          <div className="overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--ok)_35%,transparent)]">
            <div className="flex items-center gap-2.5 bg-[var(--ok-bg)] px-3 py-2.5 text-[var(--ok)]">
              <span aria-hidden="true" className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[var(--ok)] text-[var(--ok-bg)]">
                <UiIcon name="check" size={15} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p role="status" className="text-[15px] font-bold">
                  {t("Uložené")}
                </p>
                <p className="text-[14.5px]">
                  {/* Two pieces that never break inside: on a 320 px phone "o 08:00" goes under the day as one piece. */}
                  <span className="whitespace-nowrap">
                    {day && <>{day.word} </>}
                    <span className="font-data text-[17px]">{day ? day.date : shortDate(saved.date, lang)}</span>
                  </span>{" "}
                  <span className="whitespace-nowrap">
                    {t("o")} <span className="font-data text-[17px]">{saved.time}</span>
                  </span>
                </p>
                {saved.offline === "ok" && installed && <p className="mt-0.5 text-[13.5px]">{t("Funguje aj bez signálu.")}</p>}
              </div>
              <button
                type="button"
                onClick={remove}
                className="-my-2.5 -mr-1.5 shrink-0 self-stretch px-1.5 text-[13.5px] font-semibold whitespace-nowrap underline underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                {t("Odstrániť")}
              </button>
            </div>
            <LangLink
              href="/ulozene"
              onClick={() => track("my_trips_open", { from: "saved" })}
              className="flex min-h-12 items-center justify-between border-t border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[var(--card-bg)] px-3.5 text-[15px] font-bold text-[var(--foreground)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {t("Pozrieť v Mojich výletoch")}
              <UiIcon name="chev" size={18} />
            </LangLink>
          </div>
        )}
      </Reveal>

      <Reveal open={!!saved && askEve} className="roll-flex-gap" appear animate={touched}>
        {saved && (
          <div className="rounded-xl border border-[var(--border)] p-3 text-sm">
            <EveReminder ask trip={saved} plan={plan} sun={sun} closures={closures} where={where} onChange={(eve) => patch({ eve })} onAsked={saving.doneAskEve} />
          </div>
        )}
      </Reveal>

      {showButton && saved && status === "saving" && saveButton}

      {saved && askHeard && <HeardFrom onDone={saving.doneAskHeard} />}

      {/* A browser tab is promised nothing about working without signal (C224), so a failed copy is only said in the installed app. */}
      {status === "error" && installed && (
        <p className="flex items-start gap-1.5 text-sm text-[var(--warn)]">
          <UiIcon name="warn" size={16} className="mt-0.5" />
          <span>{t("Výlet je uložený, ale kópia bez signálu sa nepodarila. Skúste to znova so signálom.")}</span>
        </p>
      )}

      {saved && status !== "saving" && !askEve && <EveReminder trip={saved} plan={plan} sun={sun} closures={closures} where={where} onChange={(eve) => patch({ eve })} />}
    </div>
  );
}

/** The "Navigácia a zdieľanie" card's content: the navigation buttons, the share button, the GPX download. */
export function TripHandoff({ tripPlan, closures = [], nav = null, gpx = null, ...trip }: HandoffProps) {
  const { plan, date, time, hikeMin, driveMin, route, loading } = tripPlan;
  return (
    <div className="flex flex-col gap-3">
      {nav}
      <ShareButton
        {...trip}
        plan={loading ? null : plan}
        date={date}
        time={time}
        hikeMin={hikeMin}
        hasDrive={route !== null || driveMin !== null}
        closures={closures}
        className={`${secondary} min-h-11 w-full`}
      />
      {gpx}
    </div>
  );
}

/**
 * In the box of a friend's shared plan (C91): the friend keeps the plan in one tap, with the offline copy and
 * the question about the evening-before reminder, without scrolling to the save block of the day card. On a
 * closed day it stays away: the card below holds the closure box and its own save.
 */
export function SharedSave({ saving, plan, sun, closures = [], where = null }: { saving: TripSave; plan: TripPlan["plan"]; sun: LatLng | null; closures?: Closure[]; where?: Props["where"] }) {
  const t = useT();
  const installed = useInstalled();
  const { saved, changed, status, progress } = saving;
  if (saving.closedDay) return null;
  if (status === "saving")
    return (
      <p role="status" className="font-semibold">
        {t(installed ? "Ukladám aj na cestu bez signálu... ({done}/{total})" : "Ukladám... ({done}/{total})", { done: progress.done, total: progress.total || "?" })}
      </p>
    );
  if (saved && !changed)
    return (
      <div className="flex flex-col gap-2">
        <p role="status">
          <strong>{t("Uložené.")}</strong> {t("Nájdete to v")}{" "}
          <LangLink href="/ulozene" className="underline">
            {t("Mojich výletoch")}
          </LangLink>
          {saved.offline === "ok" && installed ? t(", funguje aj bez signálu. ").trimEnd() : "."}
        </p>
        {saving.askEve === "shared" && (
          <div className="rounded-xl bg-[var(--card-bg)] p-3">
            <EveReminder ask trip={saved} plan={plan} sun={sun} closures={closures} where={where} onChange={(eve) => saving.patch({ eve })} onAsked={saving.doneAskEve} />
          </div>
        )}
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => saving.onSave("shared")} disabled={saving.notReady} className={primary}>
        {t("Uložiť si výlet")}
      </button>
      <p className="text-xs text-[var(--muted)]">{installed ? t("Aj s mapou bez signálu a pripomienkou večer vopred.") : t("Aj s pripomienkou večer vopred.")}</p>
    </div>
  );
}

/**
 * "Získať appku": the one-time offer to put the saved trip on the home screen. A card of its own under the
 * "Navigácia a zdieľanie" card, so it doesn't mix with saving, sharing and navigating.
 */
export function AppPromo() {
  const t = useT();
  const installed = useInstalled();
  // Closed once (here or on the home page's bar), the app offer stays away. Hidden until the browser has been asked.
  const [appClosed, setAppClosed] = useState(true);
  useEffect(() => {
    let closed = false;
    try {
      closed = localStorage.getItem(APP_BAR_KEY) === "closed";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppClosed(closed);
  }, []);
  function closeApp() {
    setAppClosed(true);
    try {
      localStorage.setItem(APP_BAR_KEY, "closed");
    } catch {}
  }
  if (installed || appClosed) return null;
  return (
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--sun-soft)] p-3 text-sm">
          <span className="min-w-0 flex-1">{t("Hore na kopci bez signálu? Uložený výlet otvoríte najrýchlejšie z ikony na ploche.")}</span>
          <LangLink
            href="/aplikacia"
            onClick={() => track("app_link", { from: "saved" })}
            className="shrink-0 rounded-[var(--radius-chip)] bg-[var(--accent)] px-3 py-2 font-bold whitespace-nowrap text-[var(--accent-contrast)]"
          >
            {t("Získať appku")}
          </LangLink>
          <button type="button" onClick={closeApp} aria-label={t("Zavrieť")} className="-mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl leading-none text-[var(--muted)]">
            ×
          </button>
        </div>
  );
}
