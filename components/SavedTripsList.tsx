"use client";

import { setTripStops } from "@/lib/tripStops";
import { useEffect, useRef, useState } from "react";
import type { DayPlan } from "@/lib/dayPlan";
import { useCachedJson } from "@/lib/useDriveRoute";
import { FORECAST_DAYS, forecastForDay, tripWeatherReport, weatherNotes } from "@/lib/weather";
import type { WeatherForecast } from "@/lib/weather";
import { weatherUrl, wetText } from "@/components/WeatherBlock";
import type { Lang } from "@/lib/lang";
import { useRouter } from "next/navigation";
import { activeClosures } from "@/lib/closures";
import { planDay } from "@/lib/dayPlan";
import { UiIcon } from "@/components/UiIcon";
import { isoDate } from "@/lib/days";
import { VERDICT_SHORT, formatDateSk, formatDuration, formatTime } from "@/lib/format";
import { useSavedTrips } from "@/lib/savedTrips";
import type { SavedTrip } from "@/lib/savedTrips";
import { useTripSettings } from "@/lib/tripSettings";
import { useUserLocation } from "@/lib/userLocation";
import { Reveal } from "@/components/Reveal";
import { ReviewSheet } from "@/components/ReviewSheet";
import { SunArc } from "@/components/SunArc";
import { TrailMode, activeTrip, trackTrailStart } from "@/components/TrailMode";
import { useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";

function todayIso(): string {
  return isoDate(new Date());
}

/** Saved trips on this device. Renders from the saved snapshots alone, so it works offline. */
export function SavedTripsList() {
  const { trips, remove, patch } = useSavedTrips();
  const [reviewing, setReviewing] = useState<SavedTrip | null>(null);
  // A card moving between "Plánované" and "Absolvované" rolls out of one list and into the other (Peter, 17 Nov), but only
  // once the visitor has pressed something: the trips come out of storage right after hydration, and that is not an event.
  const [touched, setTouched] = useState(false);
  const { update } = useTripSettings();
  const { setManualStart } = useUserLocation();
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const today = todayIso();
  // "Začať výlet": the trail screen, in the address as ?na-trase=<slug> so Back closes it and a
  // reopened app finds it (offline, the saved page is served whatever the query).
  const [onTrail, setOnTrail] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setOnTrail(new URLSearchParams(window.location.search).get("na-trase"));
    // Opened the app again during a walk started today: straight back to it.
    const going = activeTrip();
    if (!new URLSearchParams(window.location.search).has("na-trase") && going) {
      window.history.replaceState(null, "", `?na-trase=${encodeURIComponent(going.slug)}`);
    }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const startTrip = (trip: SavedTrip) => {
    trackTrailStart(trip.slug);
    window.history.pushState(null, "", `?na-trase=${encodeURIComponent(trip.slug)}`);
    setOnTrail(trip.slug);
  };
  const closeTrip = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setOnTrail(null);
  };
  const walking = onTrail ? trips.find((x) => x.slug === onTrail) : undefined;

  function open(trip: SavedTrip) {
    update({ date: trip.date, time: trip.time, ...(trip.travel ? { travel: trip.travel } : {}), ...(trip.withKids !== undefined ? { withKids: trip.withKids } : {}) });
    if (trip.start) setManualStart(trip.start, "remembered");
    setTripStops(trip.slug, trip.stops ?? []);
    const href = langPath(lang, `/trasa/${trip.slug}`);
    // Offline, a full page load lets the service worker serve the saved copy
    // (client-side navigation would need a network fetch).
    if (navigator.onLine) router.push(href);
    else window.location.assign(href);
  }

  // The evening-before reminder opens /ulozene?otvorit=<slug>: that saved trip with its own day, start and stops,
  // as a tap on it here would (Peter, 15 Nov, C167). Not saved on this device any more: the trip page as it is.
  const opened = useRef(false);
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("otvorit");
    if (!slug || opened.current) return;
    const trip = trips.find((x) => x.slug === slug);
    if (!trip && trips.length === 0) return; // the list may still be loading
    opened.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    if (trip) open(trip);
    else router.push(langPath(lang, `/trasa/${slug}`));
    // Once, when the list is there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips]);

  if (trips.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm opacity-80">
        {t("Zatiaľ tu nemáte žiadny výlet. Na stránke trasy ťuknite na „Uložiť výlet“, uloží sa aj s mapou, aby fungoval bez signálu.")}
      </p>
    );
  }

  // Bol som tu (Peter, 2026-10-22): planned trips first, the ones the group went on below, then a quick review.
  const planned = trips.filter((x) => !x.doneAt);
  const done = trips.filter((x) => x.doneAt);
  const went = (trip: SavedTrip) => {
    setTouched(true);
    patch(trip.slug, { doneAt: new Date().toISOString() });
    if (!trip.reviewed) setReviewing(trip);
  };

  return (
    <>
      {walking && <TrailMode trip={walking} onClose={closeTrip} />}
      {reviewing && (
        <ReviewSheet
          slug={reviewing.slug}
          name={reviewing.name}
          onDone={(sent) => {
            if (sent) patch(reviewing.slug, { reviewed: true });
            setReviewing(null);
          }}
        />
      )}
      <div className="flex flex-col">
        <Reveal open={planned.length > 0} className="roll-gap [--roll-gap:20px]" appear={touched} animate={touched}>
          <Reveal open={done.length > 0} animate={touched} appear={touched}>
            <h2 className="pb-5 text-base font-bold">{t("Plánované")}</h2>
          </Reveal>
          <TripList trips={trips} today={today} open={open} remove={remove} went={went} start={startTrip} animate={touched} />
        </Reveal>
        <Reveal open={done.length > 0} className="roll-gap [--roll-gap:20px]" appear={touched} animate={touched}>
          <h2 className="pt-2 pb-5 text-base font-bold">
            {t("Absolvované")} <span className="font-semibold text-[var(--muted)]">· {done.length}</span>
          </h2>
          <ul className="flex flex-col">
            {trips.map((trip) => (
              <Reveal as="li" key={trip.slug} open={!!trip.doneAt} className="roll-gap [--roll-gap:8px]" appear={touched} animate={touched}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] px-4 py-3">
                  <span className="text-[var(--ok)]" aria-hidden>
                    ✓
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{trip.name}</span>
                    <span className="text-[13px] text-[var(--muted)]">{formatDateSk(trip.date, lang)}</span>
                  </span>
                  {trip.reviewed ? (
                    <span className="text-[13px] font-semibold text-[var(--muted)]">{t("ohodnotené")}</span>
                  ) : (
                    <button type="button" onClick={() => setReviewing(trip)} className="rounded-full border border-[var(--accent)] px-3 py-1.5 text-[13px] font-bold text-[var(--accent)]">
                      {t("Ohodnotiť")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setTouched(true);
                      patch(trip.slug, { doneAt: undefined });
                    }}
                    className="text-[13px] font-semibold text-[var(--muted)] underline"
                  >
                    {t("Ešte nie")}
                  </button>
                </div>
              </Reveal>
            ))}
          </ul>
        </Reveal>
      </div>
    </>
  );
}

function TripList({
  trips,
  today,
  open,
  remove,
  went,
  start,
  animate,
}: {
  animate: boolean;
  trips: SavedTrip[];
  today: string;
  open: (trip: SavedTrip) => void;
  remove: (slug: string) => void;
  went: (trip: SavedTrip) => void;
  start: (trip: SavedTrip) => void;
}) {
  return (
    <ul className="flex flex-col">
      {trips.map((trip) => (
        <Reveal as="li" key={trip.slug} open={!trip.doneAt} className="roll-gap [--roll-gap:12px]" appear={animate} animate={animate}>
          <TripCard trip={trip} today={today} open={open} remove={remove} went={went} start={start} />
        </Reveal>
      ))}
    </ul>
  );
}

const DAY = 86400000;

/** The saved copy's age, said plainly: "14. 11. o 18:05". */
function copyTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return `${formatDateSk(isoDate(d), lang).replace(/\s?\d{4}$/, "")} ${lang === "en" ? "at" : "o"} ${formatTime(d)}`;
}

/**
 * The trip day's forecast for a saved trip: a fresh one when there is signal (and the copy is updated with it),
 * otherwise the copy saved with the trip. Old trips without a copy ask at the sun's place (the trail start or parking).
 */
function useSavedWeather(trip: SavedTrip, plan: DayPlan | null, past: boolean) {
  const { patch } = useSavedTrips();
  const [now] = useState(() => Date.now());
  const saved = trip.weather;
  const inRange = !!plan && !past && plan.hikeStart.getTime() - now < FORECAST_DAYS * DAY;
  const url = saved?.url ?? weatherUrl(trip.sun);
  const live = useCachedJson<WeatherForecast>(inRange ? url : null);
  const liveTop = useCachedJson<WeatherForecast>(inRange ? (saved?.topUrl ?? null) : null);
  const below = live.data ? forecastForDay(live.data, trip.date) : null;
  const above = liveTop.data ? forecastForDay(liveTop.data, trip.date) : null;
  const key = `${live.data?.updated}|${liveTop.data?.updated}`;
  useEffect(() => {
    if (!below) return;
    if (saved && saved.below?.updated === below.updated && (above === null || saved.above?.updated === above.updated)) return;
    patch(trip.slug, {
      weather: { url, topUrl: saved?.topUrl ?? null, below, above: above ?? saved?.above ?? null, at: new Date().toISOString() },
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const none = { below: null, above: null, copyAt: null };
  if (!inRange) return { ...none, missing: plan && !past ? ("far" as const) : null };
  if (below) return { below, above: above ?? saved?.above ?? null, copyAt: null, missing: null };
  const loading = live.status === "loading" || live.status === "idle";
  if (saved?.below) return { below: saved.below, above: saved.above, copyAt: loading ? null : saved.at, missing: null };
  return { ...none, missing: loading ? null : ("signal" as const) };
}

/** The weather lines under the dial: the day in words and temperatures, rain, storm/wind/frost notes, and how old a saved copy is. */
function SavedWeatherLines({ plan, below, above, copyAt, missing }: { plan: DayPlan; below: WeatherForecast | null; above: WeatherForecast | null; copyAt: string | null; missing: "far" | "signal" | null }) {
  const t = useT();
  const lang = useLang();
  if (!below) {
    if (!missing) return null;
    return <p className="text-[13px] text-[var(--muted)]">{missing === "far" ? t("Predpoveď na tento deň ešte nie je.") : t("Predpoveď počasia sa načíta, keď budete mať signál.")}</p>;
  }
  const from = plan.segments[0].start;
  const to = plan.segments[plan.segments.length - 1].end;
  const report = tripWeatherReport(below, above, from, to, { from: plan.hikeStart, to: plan.hikeEnd }, lang);
  if (!report) return <p className="text-[13px] text-[var(--muted)]">{t("Predpoveď na tento deň ešte nie je.")}</p>;
  const notes = weatherNotes(below, above, plan.hikeStart, plan.hikeEnd, lang);
  const stormy = notes.some((n) => n.strong);
  const temp = report.tempMin === report.tempMax ? `${report.tempMax}` : t("{a} až {b}", { a: report.tempMin, b: report.tempMax });
  const worst = report.worst.charAt(0).toUpperCase() + report.worst.slice(1);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        <span className="opacity-70">{t("Počasie")}: </span>
        <span className="font-medium">
          {worst}, {temp.replaceAll("-", "−")}&nbsp;°C
        </span>
        {report.topMin !== null && <span className="opacity-70">, {t("na vrchole až {t} °C", { t: String(report.topMin).replace("-", "−") }).replace(" °C", "\u00a0°C")}</span>}
      </p>
      {report.wet && !stormy && <p className="text-[13px] font-semibold text-[var(--warn)]">{wetText(report.wet, lang)}</p>}
      {notes.map((n) => (
        <p key={n.text} className={`flex items-start gap-1.5 text-[13px] font-semibold ${n.strong ? "text-[var(--danger)]" : "text-[var(--warn)]"}`}>
          {n.strong && <UiIcon name="warn" size={16} className="mt-0.5 shrink-0" />}
          <span>{n.text}</span>
        </p>
      ))}
      {copyAt && <p className="text-[13px] text-[var(--muted)]">{t("Uložená predpoveď z {when}.", { when: copyTime(copyAt, lang) })}</p>}
    </div>
  );
}

function TripCard({
  trip,
  today,
  open,
  remove,
  went,
  start,
}: {
  trip: SavedTrip;
  today: string;
  open: (trip: SavedTrip) => void;
  remove: (slug: string) => void;
  went: (trip: SavedTrip) => void;
  start: (trip: SavedTrip) => void;
}) {
  const t = useT();
  const lang = useLang();
  const transit = trip.transit ?? false;
  const byTrain = transit && !!trip.fixed;
  const plan = planDay({
    date: trip.date,
    start: trip.time,
    driveMin: trip.driveMin,
    hikeMin: trip.hikeMin,
    location: trip.sun,
    travelMode: transit ? "transit" : "auto",
    approx: transit && !trip.fixed,
    fixed: trip.fixed ?? null,
  });
  const past = trip.date < today;
  const good = plan?.verdict === "ok" || plan?.verdict === "close";
  const weather = useSavedWeather(trip, plan, past);
  return (
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--card-bg)] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-lg font-semibold">{trip.name}</h2>
              <span className="text-sm tabular-nums">
                {formatDateSk(trip.date, lang)} {t("o")} {trip.time}
                {past && ` · ${t("už prebehol")}`}
              </span>
            </div>
            <p className="text-sm opacity-70">
              {trip.start ? t("Štart: {name}", { name: t(trip.start.label) }) : t("Bez miesta štartu")}
              {trip.driveMin !== null && ` · ${t(byTrain ? "vlakom" : transit ? "autobusom" : "autom")} ${formatDuration(trip.driveMin)}`}
              {` · ${t("túra")} ${formatDuration(trip.hikeMin)}`}
              {trip.withKids && ` · ${t("s deťmi")}`}
              {" · "}
              {trip.offline === "ok" ? t("funguje bez signálu") : t("len so signálom")}
            </p>
            {!past && trip.closures && activeClosures(trip.closures, trip.date).length > 0 && (
              <p className="flex items-start gap-1.5 text-[13px] font-semibold text-[var(--danger)]">
                <UiIcon name="warn" size={16} className="mt-0.5 shrink-0" />
                <span>{t("Chodník je v deň výletu ({date}) uzavretý", { date: formatDateSk(trip.date, lang) })}</span>
              </p>
            )}
            {plan && (
              <>
                <div className="-mx-4 overflow-hidden border-y border-[var(--border)]">
                  <SunArc plan={plan} profile={trip.profile ?? null} sun={trip.sun} hasDrive={trip.driveMin !== null} byBus={transit} byTrain={byTrain} weather={weather.below} />
                </div>
                <p className="text-sm">
                  <span className="opacity-70">{t("koniec túry")} {formatTime(plan.hikeEnd)} </span>
                  <span className={`font-medium ${good ? "text-[var(--ok)]" : "text-[var(--warn)]"}`}>
                    {t(VERDICT_SHORT[plan.verdict])}
                  </span>
                </p>
                {!past && <SavedWeatherLines plan={plan} below={weather.below} above={weather.above} copyAt={weather.copyAt} missing={weather.missing} />}
              </>
            )}
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={() => start(trip)}
                className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent-contrast)]"
              >
                {t("Začať výlet")}
              </button>
              <button
                type="button"
                onClick={() => open(trip)}
                className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent)]"
              >
                {t("Otvoriť")}
              </button>
              <button
                type="button"
                onClick={() => went(trip)}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ${past ? "bg-[var(--ok)] text-white" : "border border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent)]"}`}
              >
                {t("Už sme tu boli")} ✓
              </button>
              <button
                type="button"
                onClick={() => remove(trip.slug)}
                className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent)]"
              >
                {t("Odstrániť")}
              </button>
            </div>
          </div>
  );
}
