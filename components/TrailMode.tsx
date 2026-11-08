"use client";

import { UiIcon } from "@/components/UiIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { TrailMap } from "@/components/TrailMapClient";
import { TrailReminders, endReminders } from "@/components/TrailReminders";
import type { MapMarker, MapTrack } from "@/components/TrailMap";
import { track } from "@/lib/analytics";
import { hikeMinutes } from "@/lib/dayPlan";
import { formatDistance, formatDurationShort, formatWalk } from "@/lib/format";
import { useLang, useT } from "@/lib/i18n";
import { MARKING_COLOR, MARKING_LABEL } from "@/lib/mapLayers";
import { markSigns } from "@/lib/markSigns";
import { NETWORK_ON } from "@/lib/trailNetwork";
import { buildWalk, locate, timing, turnBack } from "@/lib/onTrail";
import type { OnTrail } from "@/lib/onTrail";
import { useSavedTrips } from "@/lib/savedTrips";
import type { SavedTrail, SavedTrip } from "@/lib/savedTrips";
import { getSunTimes } from "@/lib/sun";
import type { MarkColour, TripDetail } from "@/lib/tripSchema";
import type { BBox, LatLng } from "@/lib/types";
import { clockShort, wallClock } from "@/lib/zoned";

/** The trip under way and where on its walk the visitor was last seen, so a reopened app goes on from there. */
const ACTIVE_KEY = "turuj-on-trail";
/** A fix less accurate than this is too rough to place on a path: say so. */
const ROUGH_M = 100;
/** Stretches without a trail marking: the trip map's muted brown. */
const UNMARKED_COLOUR = "#8a6a4a";

interface Active {
  slug: string;
  day: string;
  memo: number | null;
}

function today(): string {
  const w = wallClock(Date.now());
  return `${w.y}-${w.mo}-${w.d}`;
}

/** The trip started today on this device, if any. */
export function activeTrip(): Active | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_KEY) ?? "null") as Active | null;
    return v && typeof v.slug === "string" && v.day === today() ? v : null;
  } catch {
    return null;
  }
}

function writeActive(v: Active | null) {
  try {
    if (v) localStorage.setItem(ACTIVE_KEY, JSON.stringify(v));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage blocked: the screen still works, it just starts over when reopened.
  }
}

/** Trips saved before the walk was kept with them: load it once from the trip file (needs signal). */
async function fetchTrail(slug: string): Promise<SavedTrail | null> {
  try {
    const res = await fetch(`/data/trips/${encodeURIComponent(slug)}.json`);
    if (!res.ok) return null;
    const trip = (await res.json()) as TripDetail;
    return {
      path: trip.path,
      marking_runs: trip.marking_runs,
      turnaround_index: trip.turnaround_index,
      route: trip.route,
      duration_min: trip.duration_min,
      goal: trip.destination.name,
      bbox: null,
    };
  } catch {
    return null;
  }
}

function boundsOf(path: SavedTrail["path"]): BBox {
  const lats = path.map((p) => p[1]);
  const lons = path.map((p) => p[0]);
  return { sw: { lat: Math.min(...lats), lon: Math.min(...lons) }, ne: { lat: Math.max(...lats), lon: Math.max(...lons) } };
}

type Status = "loading" | "locating" | "on" | "denied" | "unavailable" | "nodata";

/**
 * "Začať výlet" on Moje výlety (C10, Peter 2026-10-29): a screen of its own for the walk.
 * While it is open each GPS fix is placed on the planned walk: how far along, which marking now
 * and next, when to be at the goal to be back before dark. A web app gets no GPS with the phone
 * locked, so opening it again simply takes a new fix and goes on from the last spot.
 */
export function TrailMode({ trip, onClose }: { trip: SavedTrip; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const { patch } = useSavedTrips();
  const [trail, setTrail] = useState<SavedTrail | null>(trip.trail ?? null);
  const [status, setStatus] = useState<Status>(trip.trail ? "locating" : "loading");
  const [fix, setFix] = useState<(LatLng & { accuracy: number }) | null>(null);
  const [pos, setPos] = useState<OnTrail | null>(null);
  const memo = useRef<number | null>(null);
  const walk = useMemo(() => (trail ? buildWalk(trail) : null), [trail]);

  useEffect(() => {
    if (trip.trail) return;
    let gone = false;
    fetchTrail(trip.slug).then((got) => {
      if (gone) return;
      if (!got) return setStatus("nodata");
      setTrail(got);
      patch(trip.slug, { trail: got });
      setStatus("locating");
    });
    return () => {
      gone = true;
    };
  }, [trip.slug, trip.trail, patch]);

  const live = status === "locating" || status === "on";
  useEffect(() => {
    if (!live || !walk) return;
    if (!("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unavailable");
      return;
    }
    const was = activeTrip();
    memo.current = was?.slug === trip.slug ? was.memo : null;
    writeActive({ slug: trip.slug, day: today(), memo: memo.current });
    let watch: number | null = null;
    let got = false;
    const start = () => {
      if (watch !== null) return;
      watch = navigator.geolocation.watchPosition(
        (p) => {
          const f = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
          const here = locate(walk, f, memo.current);
          // An off-route fix says nothing about progress: keep the last good spot.
          if (!here.offRoute) {
            memo.current = here.memo;
            writeActive({ slug: trip.slug, day: today(), memo: here.memo });
          }
          got = true;
          setFix(f);
          setPos(here);
          setStatus("on");
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setStatus("denied");
          else if (!got) setStatus("unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
      );
    };
    const stop = () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      watch = null;
    };
    // The browser stops GPS for a hidden page anyway; ask again as soon as it is back on screen.
    const onVisible = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [live, walk, trip.slug]);

  // No page scrolling behind the screen.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const tracks = useMemo<MapTrack[]>(() => {
    if (!walk || !trail) return [];
    // The way there only (a there-and-back walk comes back on the same line), one piece per marking.
    const end = walk.loop ? walk.points.length - 1 : walk.goal;
    const out: MapTrack[] = [];
    let s = 0;
    for (let i = 1; i <= end; i++) {
      if (i < end && walk.colour[i] === walk.colour[s]) continue;
      const c = walk.colour[s];
      out.push({ slug: `${trip.slug}-${s}`, points: walk.points.slice(s, i + 1).map((p) => [p.lat, p.lon]), color: c ? MARKING_COLOR[c] : UNMARKED_COLOUR, state: "selected", arrows: walk.loop });
      s = i;
    }
    return out;
  }, [walk, trail, trip.slug]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!walk || !trail) return [];
    const mark = (c: MarkColour | null) => (c ? t(MARKING_LABEL[c]) : t("bez značky"));
    const signs = markSigns(trail).signs.map((s, i) => ({
      id: `mark-${i}`,
      kind: "mark" as const,
      location: s.location,
      title: walk.loop ? t("Ďalej {mark}", { mark: mark(s.colour) }) : t("Zmena značky"),
      lines: walk.loop ? [] : [t("Cestou tam ďalej {mark}", { mark: mark(s.colour) }), t("Cestou späť ďalej {mark}", { mark: mark(s.before) })],
      colour: s.colour ? `linear-gradient(#fff 0 30%, ${MARKING_COLOR[s.colour]} 30% 70%, #fff 70%)` : undefined,
    }));
    return [
      ...signs,
      { id: "start", kind: "trailhead" as const, location: walk.points[0], title: t("Začiatok trasy") },
      { id: "goal", kind: "goal" as const, location: walk.points[walk.goal], title: trail.goal, lines: [t("Cieľ výletu")], active: true },
      ...(fix ? [{ id: "me", kind: "me" as const, location: fix, title: t("Tu ste"), active: true }] : []),
    ];
  }, [walk, trail, fix, t]);

  const bounds = useMemo(() => (trail ? (trail.bbox ?? boundsOf(trail.path)) : null), [trail]);

  const finish = () => {
    writeActive(null);
    endReminders(trip.slug);
    onClose();
  };
  const turned = () => {
    if (!pos || !walk || !fix) return;
    const back = turnBack(walk, pos.at);
    memo.current = back;
    writeActive({ slug: trip.slug, day: today(), memo: back });
    setPos(locate(walk, fix, back));
  };

  const mark = (c: MarkColour | null) => (c ? t(MARKING_LABEL[c]) : t("bez značky"));
  const swatch = (c: MarkColour | null) => (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-6 shrink-0 rounded-[2px] border border-[#5b6577]"
      style={{ background: c ? `linear-gradient(#fff 0 30%, ${MARKING_COLOR[c]} 30% 70%, #fff 70%)` : "#fff", borderStyle: c ? "solid" : "dashed" }}
    />
  );

  let body: React.ReactNode;
  if (status === "nodata") {
    body = <p>{t("Trasu tohto výletu teraz nevieme načítať. Pripojte sa na internet alebo výlet uložte znova.")}</p>;
  } else if (status === "denied") {
    body = <p>{t("Prístup k polohe je zamietnutý. Povoľte ho pre túto stránku v nastaveniach prehliadača.")}</p>;
  } else if (status === "unavailable") {
    body = (
      <div className="flex flex-col gap-2">
        <p>{t("Polohu sa nepodarilo zistiť. Skúste to znova pod holým nebom.")}</p>
        <button type="button" onClick={() => setStatus("locating")} className="w-fit font-semibold text-[var(--accent)] underline">
          {t("Skúsiť znova")}
        </button>
      </div>
    );
  } else if (!pos || !fix || !walk) {
    body = <p className="text-[var(--muted)]">{t("Zisťujeme vašu polohu…")}</p>;
  } else {
    const walkMin = hikeMinutes(trail!.duration_min, trip.withKids ?? false);
    const now = new Date();
    const w = wallClock(now);
    const sunset = getSunTimes(new Date(Date.UTC(w.y, w.mo - 1, w.d)), fix.lat, fix.lon)?.sunset ?? null;
    const time = timing(pos, walkMin, now, sunset);
    const toGoal = Math.round(walkMin * pos.toGoalShare);
    // On the way there, past the latest time to be at the goal: say when they'd be back if they turned now.
    const tooLate = !!(time.atGoal && time.latestAtGoal && time.atGoal > time.latestAtGoal);
    body = (
      <div className="flex flex-col gap-2.5" aria-live="polite">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{pos.pastGoal && !walk.loop ? t("Cestou späť") : t("Cestou tam")}</span>
          <span className="tabular-nums text-[var(--muted)]">
            {t("{done} z {total}", { done: formatDistance(pos.doneM, lang), total: formatDistance(pos.totalM, lang) })}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-[var(--border)]" role="presentation">
          <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round(pos.doneShare * 100)}%` }} />
        </div>

        {pos.offRoute ? (
          <p className="flex items-start gap-1.5 font-semibold text-[var(--warn)]"><UiIcon name="warn" size={16} className="mt-0.5" /><span>{t("Ste asi {m} od trasy.", { m: formatWalk(Math.round(pos.offM / 10) * 10, lang) })}</span></p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-base">
            <li className="flex items-center gap-2.5">
              {swatch(pos.colour)}
              <span>{t("Teraz {mark}", { mark: mark(pos.colour) })}</span>
            </li>
            <li className="flex items-center gap-2.5">
              {swatch(pos.next ? pos.next.colour : pos.colour)}
              <span>
                {pos.next
                  ? t("O {m} ďalej {mark}", { m: formatWalk(Math.max(10, Math.round(pos.next.inM / 10) * 10), lang), mark: mark(pos.next.colour) })
                  : t("Do konca bez zmeny značky")}
              </span>
            </li>
          </ul>
        )}

        <p className="tabular-nums">
          {time.atGoal
            ? t("K cieľu ({goal}) asi {left}, okolo {at}.", { goal: trail!.goal, left: formatDurationShort(toGoal), at: clockShort(time.atGoal) })
            : t("Do konca asi {left}, koniec okolo {at}.", { left: formatDurationShort(time.leftMin), at: clockShort(time.finish) })}
        </p>
        {time.latestAtGoal && !tooLate && (
          <p className="tabular-nums">{t("Pri cieli buďte najneskôr o {at}, aby ste boli späť za svetla.", { at: clockShort(time.latestAtGoal) })}</p>
        )}
        {tooLate && time.backIfTurned && (
          <p className="flex items-start gap-1.5 font-semibold text-[var(--warn)]">
            <UiIcon name="warn" size={16} className="mt-0.5" />
            <span>{t("K cieľu a späť za svetla to už nestihnete. Ak sa otočíte teraz, budete späť okolo {at}.", { at: clockShort(time.backIfTurned) })}</span>
          </p>
        )}
        {!time.atGoal && time.late && sunset && (
          <p className="flex items-start gap-1.5 font-semibold text-[var(--warn)]"><UiIcon name="warn" size={16} className="mt-0.5" /><span>{t("Týmto tempom budete späť až po západe slnka ({at}).", { at: clockShort(sunset) })}</span></p>
        )}
        {fix.accuracy > ROUGH_M && <p className="text-[var(--muted)]">{t("Poloha je zatiaľ nepresná (±{m}).", { m: formatWalk(Math.round(fix.accuracy / 10) * 10, lang) })}</p>}
        {!walk.loop && !pos.pastGoal && (
          <button type="button" onClick={turned} className="w-fit font-semibold text-[var(--accent)] underline">
            {t("Otočili sme sa")}
          </button>
        )}
        <TrailReminders slug={trip.slug} name={trip.name} turnAt={walk.loop ? null : time.latestAtGoal} sunset={sunset} pastGoal={pos.pastGoal} now={now} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)] pt-[env(safe-area-inset-top)]" role="dialog" aria-modal="true" aria-label={trip.name}>
      <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <button type="button" onClick={onClose} className="shrink-0 text-sm font-semibold text-[var(--accent)]">
          ← {t("Moje výlety")}
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold">{trip.name}</h1>
        <button type="button" onClick={finish} className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-sm font-semibold">
          {t("Ukončiť")}
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        {trail && <TrailMap tracks={tracks} markers={markers} bounds={bounds} network={NETWORK_ON ? "context" : undefined} ariaLabel={t("Mapa výletu {name}", { name: trip.name })} className="h-full w-full" />}
      </div>
      <section className="max-h-[55dvh] overflow-y-auto border-t border-[var(--border)] bg-[var(--card-bg)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] text-sm">
        {body}
        <p className="pt-3 text-xs text-[var(--muted)]">
          {t("Poloha sa obnovuje, kým je Túruj otvorený. Po zamknutí mobilu ju pri ďalšom otvorení zistíme znova.")}
        </p>
      </section>
    </div>
  );
}

/** "Začať výlet" was tapped: counted once per start. */
export function trackTrailStart(slug: string) {
  track("on_trail", { trail: slug });
}
