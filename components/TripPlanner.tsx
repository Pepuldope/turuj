"use client";

import { UiIcon } from "@/components/UiIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { outsideDaylight } from "@/lib/dayPlan";
import type { Verdict } from "@/lib/dayPlan";
import { EARLIEST_DEPARTURE_HOUR, addDaysIso, dayAfterNa, dayStrip, floorTo5, longDay } from "@/lib/days";
import { badDays } from "@/lib/weather";
import { collectPlanWarnings } from "@/lib/planWarnings";
import { PlanDayProvider } from "@/lib/planDay";
import { stopsAdvice } from "@/lib/stopsAdvice";
import type { PlanDay } from "@/lib/planDay";
import { formatDuration, formatDurationShort, formatTime, stopLabel } from "@/lib/format";
import { haversineM } from "@/lib/geo";
import { walkThereMinutes } from "@/lib/walkThere";
import { formatKm, walkMinutes } from "@/lib/walkFacts";
import { fitOnMap } from "@/lib/mapFocus";
import { parkingPlace, readSharedPlan } from "@/lib/links";
import { track } from "@/lib/analytics";
import type { SharedPlan, WalkRoute } from "@/lib/links";
import { useTripSettings } from "@/lib/tripSettings";
import { useTripPlan } from "@/lib/useTripPlan";
import { useUserLocation } from "@/lib/userLocation";
import { clock, clockShort, hourOf, zonedDate } from "@/lib/zoned";
import type { BBox, Closure, LatLng } from "@/lib/types";
import { KidsRow } from "@/components/FilterChips";
import { KedyBody, kedySummary, kedyWarnings } from "@/components/KedyStep";
import type { KedyProps } from "@/components/KedyStep";
import { hasLeg, latestSetStart } from "@/lib/kedyTimeline";
import { NavHandoff } from "@/components/NavHandoff";
import { AppPromo, SaveTripButton } from "@/components/SaveTripButton";
import type { ShareInfo } from "@/components/ShareButton";
import { PlanStep, PlanStepsProvider, PlanWarningsRecap, StepInfo } from "@/components/PlanStep";
import type { StepDef } from "@/components/PlanStep";
import { ParkingOptions, feeLabel, summaryWalk } from "@/components/ParkingBlock";
import { NoStartNote, PlanStartAsk } from "@/components/PlanStartAsk";
import { StopsRow } from "@/components/StopsRow";
import { SunArc } from "@/components/SunArc";
import { DayMapLegend } from "@/components/DayMapLegend";
import { goalTime, trailColours } from "@/lib/dayClock";
import { usePublishDay } from "@/lib/usePublishDay";
import { useTripAccess } from "@/components/TripAccess";
import { useTripWeather } from "@/components/WeatherBlock";
import { StopOptions, TransitHandoff, TransitLegs } from "@/components/TransitBlock";
import { TravelSwitch } from "@/components/TravelSwitch";
import { GOAL_WORDS, trimProfile, withApproach, withStops } from "@/lib/tripProfile";
import { LUNCH, STAY_MIN, keepStopsOf, stopsMinutes, useTripStops } from "@/lib/tripStops";
import type { LunchPick } from "@/components/StopsRow";
import type { PauseAt, TripProfile } from "@/lib/tripProfile";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import type { SavedTrail } from "@/lib/savedTrips";

interface Props extends ShareInfo {
  sun: LatLng | null;
  /** The trip's goal, for the weather up there. */
  goal: (LatLng & { ele: number | null; name: string }) | null;
  profile: TripProfile | null;
  gpxUrl: string | null;
  bbox: BBox | null;
  /** The trail's closure rules (empty when none is known). */
  closures?: Closure[];
  /** The trail itself, for the walking hand-off. */
  walk: WalkRoute;
  /** Top of the first card: the trail's facts and route choice. */
  intro?: ReactNode;
  /** After the plan card: the quiet "no closure data" note. */
  children?: ReactNode;
  /** Under the plan card, in the last card. */
  outro?: ReactNode;
  /** How many routes the trip has: with one there is no route choice, only a line of plain info. */
  routeCount?: number;
  /** The "Kadiaľ pôjdete" step (several routes only; components/RouteChoice.tsx). */
  routesStep?: ReactNode;
  /** A phone's map for the "Ako pôjdete" step, and for the "Zastávky po ceste" one. */
  accessMap?: ReactNode;
  placesMap?: ReactNode;
  /** The small map above the sun dial: the whole day on a map, with a walker that follows the dial (components/TripSheet.tsx). */
  dayMap?: ReactNode;
  /** The places on the way, with their "+" buttons (components/PoiList.tsx). */
  places?: ReactNode;
  /** The trip has places on or near the walk that can be added as stops. */
  hasPlaces?: boolean;
  /** The GPX download, an action of the "Uložiť a navigovať" card. */
  gpxAction?: ReactNode;
  /** The walk, kept with the saved trip for the trail screen ("Začať výlet"). */
  trail?: SavedTrail;
  /** The trip is in the Tatras: TANAP allows walking outside villages only from sunrise to sunset. */
  tanap?: boolean;
}

/** One of the page's three cards, set off from the darker page so each step reads on its own. */
const part =
  "flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--card-edge)] bg-[var(--card-bg)] p-4 shadow-[var(--shadow-card)]";


/**
 * The trip page in three cards: the plan (start, travel, day and time), the day itself
 * (sun dial, times, weather, a warning only when the start is too late), then getting there
 * (parking, map...) with Uložiť (main), share and navigation hand-offs.
 */
/** The meeting time on the shared day, as a moment. */
function meetingAt(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return zonedDate(y, mo, d, h, mi);
}

export function TripPlanner({ sun, goal, profile: fullProfile, gpxUrl, gpxAction = null, bbox, closures = [], walk, intro, children, outro, routeCount = 1, routesStep, accessMap, placesMap, dayMap, places, hasPlaces = false, trail, tanap = false, ...trip }: Props) {
  const { start } = useUserLocation();
  const { today, update, withKids } = useTripSettings();
  const t = useT();
  const lang = useLang();
  const { destination, rideTo, approachMin, trailStart, transit: transitAccess, noCar, noBus, parking, stop, skip, walkFrom, trailJoin, walk: onFoot, choose, chooseStop, setWalking } = useTripAccess();
  // The walk from the parking (by car) or the stop (by train/bus) to the trail and back belongs to the day,
  // with or without a start: the walk back to the car must fit the light too. Parked up the trail, the
  // stretch below is skipped both ways.
  const baseHikeMin = onFoot.min;
  // The walk to the trail comes first and last, so the goal time counts it too.
  const walkProfile = useMemo(() => {
    const trail = fullProfile && skip ? trimProfile(fullProfile, skip.skip_out, skip.skip_back) : fullProfile;
    return trail && withApproach(trail, approachMin / Math.max(1, baseHikeMin));
  }, [fullProfile, skip, approachMin, baseHikeMin]);
  // One plan for the whole page: saving and sharing use the same train times the sun dial shows.
  // A start this close to the trail can go on foot (Peter, 2026-10-22): Pešo next to Autom and Bus/vlak.
  const walkThere = start && trailStart ? walkThereMinutes(haversineM(start, trailStart)) : null;
  const [onFootChoice, setOnFoot] = useState(false);
  const walking = onFootChoice && walkThere !== null;
  // The map, the parking card and the navigation follow: on foot there's no parking or stop to show.
  useEffect(() => setWalking(walking), [walking, setWalking]);
  // On foot there is no bus either: everything below reads `transit` as the ride actually taken.
  const transit = transitAccess && !walking;
  // Where the hike starts, as the calendar event's place: the stop by train or bus, else the parking, else the trail start.
  const calendarPlace = useMemo(() => {
    if (transit && stop) return { name: `${t("Zastávka")} ${stopLabel(stop.name)}`, location: stop.location };
    if (parking) {
      const own = parking.name.trim() !== "Parkovisko" ? parking.name.replace(/^parkovisko\s+/i, "").trim() : "";
      return { name: own ? `${t("Parkovisko")} ${own}` : `${t("Parkovisko")}, ${trip.name}`, location: parking.location };
    }
    return trailStart ? { name: trip.name, location: trailStart } : null;
  }, [transit, stop, parking, trailStart, trip.name, t]);
  const tripPlan = useTripPlan(sun, rideTo, baseHikeMin, transitAccess && stop?.mode === "vlak" ? stop.location : null, transitAccess, trip.slug, walking ? walkThere : null);
  const { plan, date, time, driveMin, roadMin, driveApprox, driveStatus, rail } = tripPlan;
  // The stops the group added stand on the walk where it passes them (lunch at the goal).
  const { stops, minutes: stopMin } = useTripStops(trip.slug);
  // Stops belong to this visit: opening another trip or the list forgets them (a saved trip keeps
  // its own copy); the route comparison and the loop of this trip keep them.
  useEffect(() => keepStopsOf(trip.slug), [trip.slug]);
  // Walking time alone (the plan's time less the stops), and when the walk starts: the lunch break's
  // clock time maps onto the walk with these (Peter 2026-10-27: lunch when you want it, not only at the goal).
  const walkOnlyMin = Math.max(1, tripPlan.hikeMin - stopsMinutes(stops));
  const hikeStartMs = plan?.hikeStart.getTime() ?? null;
  const lunchTime = stops.find((s) => s.id === LUNCH.id)?.at;
  const lunchFrac = useMemo(() => {
    if (!walkProfile) return null;
    const goalAt = walkProfile.points[walkProfile.goalIndex].at;
    if (!lunchTime || hikeStartMs === null) return goalAt;
    const [h, m] = lunchTime.split(":").map(Number);
    const [sh, sm] = formatTime(new Date(hikeStartMs)).split(":").map(Number);
    const elapsed = h * 60 + m - (sh * 60 + sm);
    // Time already spent at the stops before it.
    const before = stops
      .filter((s) => s.id !== LUNCH.id)
      .reduce((sum, s) => {
        const place = walkProfile.places?.find((p) => p.id === s.id);
        return place && place.out * walkOnlyMin < elapsed ? sum + s.min : sum;
      }, 0);
    return Math.min(1, Math.max(0, (elapsed - before) / walkOnlyMin));
  }, [walkProfile, lunchTime, hikeStartMs, stops, walkOnlyMin]);
  const profile = useMemo(() => {
    if (!walkProfile || !stops.length) return walkProfile;
    const pauses = stops.flatMap((s): PauseAt[] => {
      // Lunch shows as food on the sun dial, like a buffet stop.
      if (s.id === LUNCH.id) return [{ at: lunchFrac ?? 0, min: s.min, name: s.name, kind: "obcerstvenie", icon: "restauracia" }];
      const place = walkProfile.places?.find((p) => p.id === s.id);
      if (!place) return [];
      const way = place.back === null ? "tam" : (s.way ?? "tam");
      return [
        ...(way !== "spat" ? [{ at: place.out, min: s.min, name: s.name, kind: place.kind, icon: place.icon }] : []),
        ...(way !== "tam" && place.back !== null ? [{ at: place.back, min: s.min, name: s.name, kind: place.kind, icon: place.icon }] : []),
      ];
    });
    return withStops(walkProfile, pauses, tripPlan.hikeMin);
  }, [walkProfile, stops, tripPlan.hikeMin, lunchFrac]);
  // Lunch: times to pick, and food places (or huts) the walk passes around then.
  const lunch = useMemo<LunchPick | undefined>(() => {
    if (!walkProfile || hikeStartMs === null || !plan) return undefined;
    // On the clock: the walking time to there plus the other stops before it (lunch there replaces the break).
    const clock = (frac: number) => {
      const stood = stops.reduce((sum, s) => {
        const at = walkProfile.places?.find((p) => p.id === s.id)?.out;
        return at != null && at < frac ? sum + s.min : sum;
      }, 0);
      return new Date(hikeStartMs + (frac * walkOnlyMin + stood) * 60000);
    };
    const goal = clock(walkProfile.points[walkProfile.goalIndex].at);
    const times: string[] = [];
    // Every half hour while walking, from 10:30 to 15:00.
    for (let t = Math.ceil((plan.hikeStart.getTime() + 20 * 60000) / 1800000) * 1800000; t < plan.hikeEnd.getTime() - 15 * 60000; t += 1800000) {
      const hhmm = formatTime(new Date(t));
      if (hhmm >= "10:30" && hhmm <= "15:00") times.push(hhmm);
    }
    const around = lunchFrac ?? 0;
    const near = 75 / walkOnlyMin;
    const foods = (walkProfile.places ?? [])
      .filter((p) => p.name && (p.kind === "obcerstvenie" || p.kind === "chata"))
      .map((p) => {
        // The pass closest to lunch: on the way there or back.
        const at = p.back !== null && Math.abs(p.back - around) < Math.abs(p.out - around) ? p.back : p.out;
        return { p, at, way: at === p.out ? ("tam" as const) : ("spat" as const) };
      })
      .filter((f) => Math.abs(f.at - around) <= near && !stops.some((s) => s.id === f.p.id))
      .sort((a, b) => Math.abs(a.at - around) - Math.abs(b.at - around))
      .slice(0, 3)
      .map(({ p, at, way }) => ({
        stop: { id: p.id, name: p.name!, min: (p.detour ?? 0) + STAY_MIN[p.kind], ...(walkProfile.loop ? {} : { way }) },
        kind: p.kind,
        icon: p.icon ?? "restauracia",
        time: formatTime(clock(at)),
      }));
    return { times, goalTime: formatTime(goal), foods };
  }, [walkProfile, hikeStartMs, plan, walkOnlyMin, lunchFrac, stops]);
  const [shared, setShared] = useState<SharedPlan | null>(null);
  const weather = useTripWeather(plan, trailStart, goal, walkProfile?.points[0]?.ele ?? null);
  // The day strip marks the days in the forecast whose walk (same start time) gets rain, snow, fog or storms.
  const dayWeather = useMemo(
    () => (plan && weather.strip ? badDays(weather.strip, plan.hikeStart, plan.hikeEnd, dayStrip(new Date()).map((d) => d.iso)) : undefined),
    [plan, weather.strip]
  );

  // A shared link opens the sender's day, kids pace and parking or stop (once, then it's ours to change).
  // Friends leave from different places, so it brings a meeting time where the walk starts and this
  // page works out the departure from our own start. A link for a day already gone only says so.
  const [expired, setExpired] = useState<SharedPlan | null>(null);
  useEffect(() => {
    const fromLink = readSharedPlan(window.location.search);
    if (!fromLink || !today) return;
    track("shared_open", { trail: trip.slug, expired: fromLink.date < today });
    window.history.replaceState(null, "", window.location.pathname);
    if (fromLink.date < today) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpired(fromLink);
      return;
    }
    setShared(fromLink);
    // Until the ride is known, the meeting time itself: the walk starts then.
    update({ date: fromLink.date, time: fromLink.meet ?? fromLink.time, withKids: fromLink.withKids, ...(fromLink.withKids ? { easier: true } : {}) });
    if (fromLink.transit) chooseStop(fromLink.pick);
    else choose(fromLink.pick);
    // Once per link: the trip's own setters and slug don't change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, update]);

  // Leave so the walk starts at the meeting time: the meeting time minus our own ride, to the 5 minutes
  // before. Kept in step while the ride loads; a time picked by hand ends it.
  const meet = useMemo(() => (shared?.meet && date === shared.date ? meetingAt(shared.date, shared.meet) : null), [shared, date]);
  const [anchored, setAnchored] = useState<string | null>(null);
  // By train the ride depends on the departure (another train), so a few rounds at most, never a loop.
  const [rounds, setRounds] = useState(0);
  const following = meet !== null && (anchored === null || anchored === time) && rounds < 4;
  useEffect(() => {
    if (!following || !plan || tripPlan.loading) return;
    const ride = plan.hikeStart.getTime() - plan.segments[0].start.getTime();
    const leave = clock(floorTo5(new Date(meet.getTime() - ride)));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnchored(leave);
    if (leave === time) return;
    setRounds((n) => n + 1);
    update({ time: leave });
  }, [following, plan, tripPlan.loading, meet, time, update]);

  const hasDrive = driveMin !== null;
  // The day map above the sun dial reads the same plan (lib/dayClock.ts).
  usePublishDay({ plan, profile, fullProfile, skip, approachShare: approachMin / Math.max(1, baseHikeMin), mode: walking ? "foot" : transit ? (rail.status === "ok" ? "train" : "bus") : "car", startName: start ? (start.label.trim() ? t(start.label.split(",")[0]) : t("Vaša poloha")) : null });
  // The walk starts where the ride ends: the parking (or the trail start, with no parking) or the stop.
  const walkStart = walking ? start : (walkFrom ?? destination);
  const latest = plan ? floorTo5(plan.latestStart) : null;
  const latestPassed = latest && date === today && latest < new Date();

  // Only when the chosen start oversteps: one plain warning under the day, nothing otherwise.
  const late = plan !== null && (plan.verdict === "tight" || plan.verdict === "after-sunset" || plan.verdict === "after-dusk");
  // Too long for the day's light: even leaving at first light (or before EARLIEST_DEPARTURE_HOUR) won't do.
  const tooLong =
    plan !== null &&
    latest !== null &&
    (plan.noTrainInLight === true || latest.getTime() < plan.sunrise.getTime() - (driveMin ?? 0) * 60_000 || hourOf(latest) < EARLIEST_DEPARTURE_HOUR);

  // A time picked by hand that is far off a usual day out (back only in the dark, or leaving in the
  // middle of the night) is asked about once: change it to the latest good start, or keep it.
  // `asked` is the stored time (what `time` is compared with); `confirm` is what the person typed, for the question (the same time).
  const [asked, setAsked] = useState<string | null>(null);
  const [askedWalk, setAskedWalk] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const unusual =
    plan !== null &&
    !tripPlan.loading &&
    (plan.verdict === "after-dusk" || hourOf(plan.segments[0].start) < UNUSUAL_BEFORE_HOUR);
  useEffect(() => {
    if (!asked || asked !== time) return;
    // Wait for the typing (and the route) to settle; the question is about the final time.
    const timer = setTimeout(() => {
      if (unusual) setConfirm(askedWalk ?? asked);
      setAsked(null);
    }, 800);
    return () => clearTimeout(timer);
  }, [asked, askedWalk, time, unusual]);
  // The Kedy step speaks in the time you LEAVE HOME when a leg comes before the walk (a drive, or the way to the stop), else in
  // the walk start (Peter, 2026-11-13; the 12 Nov walk-start rule made people subtract the drive). That is the stored time itself.
  const leg = plan !== null && hasLeg(plan);
  const betterSet = plan && !tooLong && !latestPassed ? clock(latestSetStart(plan)) : null;
  const latestSet = plan ? clockShort(latestSetStart(plan)) : "";

  // The plan's four choices, each folded to its current pick (components/PlanStep.tsx).
  // A trip with one route has no route choice: its numbers are plain info and the steps count on.
  const routeChoice = routeCount > 1;
  // Peter, 2026-11-12: route, stops, access, then Kedy last (the whole day is known there). Without a route
  // choice the first numbered step is the stops.
  const placesN = routeChoice ? 2 : 1;
  const accessN = placesN + 1;
  const whenN = accessN + 1;
  const dayWord = !date ? "…" : date === today ? t("Dnes") : today && date === addDaysIso(today, 1) ? t("Zajtra") : longDay(date, lang);
  const accessSummary = walking
    ? t("Pešo")
    : transit
      ? `${t(stop?.mode === "vlak" ? "Vlakom" : "Autobusom")} · ${stop ? stopLabel(stop.name) : t("bez zastávky")}`
      : `${t("Autom")} · ${parking ? [t(parking.name), summaryWalk(parking, lang), feeLabel(parking, lang)].filter(Boolean).join(", ") : t("bez parkoviska")}`;
  const steps: StepDef[] = [
    ...(routeChoice ? [{ id: "route", n: 1, title: t("Kadiaľ pôjdete"), open: true, fit: "routes" as const }] : []),
    { id: "places", n: placesN, title: t("Zastávky po ceste"), open: !routeChoice, fit: "places" as const },
    { id: "access", n: accessN, title: t("Ako pôjdete"), fit: "access" as const },
    { id: "when", n: whenN, title: t("Kedy") },
  ];
  // The recap "Pred odchodom skontrolujte": every warning the steps show now, in their own words, each with the step that fixes it.
  // Closures are not repeated: the red line next to Uložiť (ClosureGuard) already says it where it is acted on.
  const ready = plan !== null && !tripPlan.loading;
  const lateRow = ready && (late || !!latestPassed);
  const tanapLate = ready && tanap ? outsideDaylight(plan) : null;
  const lateFor = lateRow
    ? (latestStart: string) => lateText(plan.verdict, { latestPassed: !!latestPassed, tooLong, noTrain: !!plan.noTrainInLight, startWord: t(leg ? "Vyrazte" : "Začnite túru"), latest: latestStart }, lang)
    : null;
  const kedyProps: KedyProps = {
    plan,
    loading: tripPlan.loading,
    weather,
    dayWeather,
    dayWord,
    transit,
    walking,
    stopMode: stop?.mode ?? null,
    lateText: lateFor,
    latestPassed: !!latestPassed,
    tooLong,
    tanapLate,
    sun,
    closures,
    driveNote: driveStatus === "loading" && !walking ? (transit ? t("Počítame cestu na zastávku…") : t("Počítame cestu autom…")) : null,
    onTyped: (hhmm) => {
      setAskedWalk(hhmm);
      setAsked(hhmm);
    },
  };
  const kedy = kedySummary(kedyProps, t, lang);
  const warnings = collectPlanWarnings([
    // Kadiaľ pôjdete / Ako pôjdete: no car park at this route's start (another route can fix it), no stop, no train back.
    noCar && { key: "no-car", step: routeChoice ? "route" : "access", tone: "warn", text: `${t("Autom sa sem nedá.")} ${t("Pri štarte tejto cesty nie je kde nechať auto, preto plánujeme cestu autobusom alebo vlakom. Ak chcete ísť autom, vyberte inú cestu s parkoviskom.")}` },
    ready && transit && !stop && { key: "no-stop", step: "access", tone: "warn", text: t("Pri začiatku trasy sme nenašli zastávku vlaku ani autobusu. Táto túra je lepšia autom.") },
    ready && transit && !!stop && rail.status === "ok" && !rail.back[rail.backChoice] && { key: "no-train-back", step: "access", tone: "warn", text: t("Po túre už v tento deň nejde vlak späť. Skúste skorší odchod alebo autobus.") },
    ready && transit && !!stop && rail.status === "no-day" && !!rail.changeDay && { key: "rail-change", step: "access", tone: "warn", text: t("Cestovný poriadok sa mení {day} Spoj si overte na cp.sk.", { day: rail.changeDay }) },
    // Kedy: the step's own warnings, in its words (departure times with a leg, else walk-start times).
    ...kedyWarnings(kedyProps, t, lang, null).map((w) => ({ key: w.key, step: "when", tone: w.tone, text: w.text })),
  ]);

  // Car, bus or on foot changes what the "how you get there" map shows: the big map frames it again.
  const wayKey = `${transit}-${walking}`;
  const lastWay = useRef(wayKey);
  useEffect(() => {
    if (lastWay.current === wayKey) return;
    lastWay.current = wayKey;
    fitOnMap("access");
  }, [wayKey]);
  // The chosen day for the steps before Kedy (route notes, stops' return time): lib/planDay.tsx.
  const planDay: PlanDay = {
    plan,
    loading: tripPlan.loading,
    dayWord,
    dayNa: !date ? "" : date === today ? t("dnes") : today && date === addDaysIso(today, 1) ? t("zajtra") : dayAfterNa(date, lang),
    stopMin,
    leadMs: plan ? plan.hikeStart.getTime() - plan.segments[0].start.getTime() : 0,
    setStart: (hhmm) => {
      if (date) update({ time: hhmm });
    },
  };
  const stopsWord = t(stops.length === 1 ? "{n} zastávka" : stops.length < 5 ? "{n} zastávky" : "{n} zastávok", { n: stops.length });

  return (
    <div className="flex flex-col gap-5">
      {/* The trip's facts: what it is, how others found it, a shorter way and closures. The choices are in the plan card below. */}
      <section aria-label={t("Plán výletu")} className={part}>
        {intro}

        {shared && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-[var(--accent-soft)] p-4 text-sm">
            <p>
              <strong>{t("Plán od kamaráta")}</strong> · {longDay(shared.date, lang)}
              {shared.withKids ? t(", s deťmi") : ""}
            </p>
            {shared.meet ? (
              <>
                <p>
                  <strong className="font-data text-base">{shared.meet.replace(/^0/, "")}</strong> {t("stretnutie")}{" "}
                  {shared.transit && stop ? t("na zastávke {stop}", { stop: stopLabel(stop.name) }) : !transit && parking ? parkingPlace(parking.name, lang) : t("na začiatku trasy")}
                </p>
                <p className="text-[var(--muted)]">
                  {!start
                    ? t("Zadajte hore, odkiaľ vyrážate, a ukážeme, kedy vyraziť.")
                    : following
                      ? t("Odchod nižšie je zo štartu {start}, aby ste tam boli o {time}.", { start: t(start.label.split(",")[0]), time: shared.meet.replace(/^0/, "") })
                      : t("Čas odchodu ste zmenili, nižšie je podľa vás.")}
                </p>
              </>
            ) : (
              <p className="text-[var(--muted)]">{t("Odchod {time} z miesta kamaráta, nižšie je prepočítaný z vášho.", { time: shared.time ?? "" })}</p>
            )}
          </div>
        )}

        {expired && (
          <p className="rounded-[var(--radius-card)] bg-[var(--accent-soft)] p-4 text-sm">
            {t("Plán od kamaráta bol na")} <strong>{dayAfterNa(expired.date, lang)}</strong>{t(", ten deň už prešiel. Nižšie si vyberte nový deň.")}
          </p>
        )}
      </section>

      {confirm && plan && (
        <UnusualTime
          time={confirm}
          text={
            late || latestPassed
              ? lateText(plan.verdict, { latestPassed: !!latestPassed, tooLong, noTrain: !!plan.noTrainInLight, startWord: t(leg ? "Vyrazte" : "Začnite túru"), latest: latestSet }, lang)
              : t("To je uprostred noci, cesta by začínala po tme. Nemysleli ste ráno?")
          }
          better={late || latestPassed ? betterSet : NIGHT_FIX}
          onBetter={() => {
            planDay.setStart((late || latestPassed ? betterSet : NIGHT_FIX)!);
            setConfirm(null);
          }}
          onKeep={() => setConfirm(null)}
        />
      )}

      {/* F9: interactive planner chrome stays out of Google's snippets (data-nosnippet). */}
      {/* Buttons and links here are pointer targets (Tailwind 4 leaves buttons on the arrow); a washed-out one keeps its own cursor. */}
      <section data-nosnippet aria-label={t("Váš plán")} className={`${part} [&_a]:cursor-pointer [&_button:not(:disabled):not([aria-disabled])]:cursor-pointer`}>
        <h2 className="text-[1.35rem] leading-tight font-bold">{t("Váš plán")}</h2>
        {/* Quiet once there is a start (Peter, 2026-11-11); without one a card asks for it (2026-11-12). */}
        <PlanStartAsk />

        <PlanDayProvider value={planDay}>
        <PlanStepsProvider steps={steps} resultId="vas-den">
        {routeChoice ? (
          routesStep
        ) : (
          // The kids' switch changes this walk time, so it sits here and not in Kedy (Peter, 2026-11-12).
          <StepInfo
            title={t("Kadiaľ pôjdete")}
            extra={
              <div className="flex flex-col gap-2.5">
                <KidsRow boxed />
                <NoStartNote>{t("Časy trás platia od parkoviska, cestu k nemu bez štartu nepočítame.")}</NoStartNote>
              </div>
            }
          >
            <span className="font-data">{formatDuration(walkMinutes(onFoot, withKids))}</span> · <span className="font-data">{formatKm(onFoot.m, lang)}</span> · <span className="font-data">+{onFoot.ascentM} m</span>
            {withKids ? ` · ${t("s deťmi")}` : ""}
          </StepInfo>
        )}

        <PlanStep
          id="places"
          n={placesN}
          title={t("Zastávky po ceste")}
          // The stops alone push the walk past sunset: the step's own box (PoiList, R1w) says why and how out.
          warn={ready && stopsAdvice(plan, stops.map((s) => ({ id: s.id, name: s.name, minutes: s.min }))) !== null}
          summary={
            stops.length === 0 ? (
              hasPlaces ? t("Zatiaľ žiadna nevybraná") : t("Prestávka na obed? Pridajte ju nižšie")
            ) : (
              <>
                {stopsWord} · <span className="font-data">+{formatDurationShort(stopMin)}</span>
              </>
            )
          }
        >
          <NoStartNote>{t("Návrat počítame bez cesty autom.")}</NoStartNote>
          {placesMap}
          <StopsRow slug={trip.slug} hasPlaces={hasPlaces} loop={!!walkProfile?.loop} lunch={lunch} />
          {places}
        </PlanStep>

        <PlanStep id="access" n={accessN} title={t("Ako pôjdete")} summary={accessSummary}>
          <NoStartNote>{t("Bez štartu nepočítame cestu autom ani autobusom.")}</NoStartNote>
          <TravelSwitch roadMin={roadMin} trainMin={rail.status === "ok" ? driveMin : null} noCar={noCar} noBus={noBus} walkMin={walkThere} walking={walking} onWalk={setOnFoot} />
          {/* The sub-heading follows the choice (Peter, 2026-11-13, mockup D1): where to park, or where to get off; on foot there is none. */}
          {!walking && (
            <h3 className="flex items-center gap-2 text-base font-bold">
              {transit ? (
                <>
                  <span className="text-[var(--accent)]">
                    <UiIcon name="bus" size={20} />
                  </span>
                  {t("Kde vystúpite")}
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="grid h-[18px] w-[18px] place-items-center rounded bg-[var(--accent)] text-[12px] leading-none font-extrabold text-[var(--accent-contrast)]">
                    P
                  </span>
                  {t("Kde zaparkujete")}
                </>
              )}
            </h3>
          )}
          {accessMap}
          {transit ? <StopOptions /> : <ParkingOptions />}
          {transit && <TransitHandoff />}
        </PlanStep>

        <PlanStep id="when" n={whenN} title={t("Kedy")} warn={kedy.warn} summary={kedy.summary}>
          <NoStartNote>{t("Bez štartu nevieme, kedy vyraziť ani kedy budete doma.")}</NoStartNote>
          <KedyBody {...kedyProps} />
        </PlanStep>

        <div id="vas-den" className="flex scroll-mt-[calc(64px+env(safe-area-inset-top))] flex-col gap-4 lg:scroll-mt-3">
        {plan && (
          <section aria-label={t("Priebeh dňa")} className="flex flex-col gap-4 border-t border-[var(--border)] pt-4">
            {(dayMap || sun) && (
              // The map and the sun dial are one block (Peter, 2026-11-13: a legend between them made the map feel
              // disconnected), with one legend under it for both.
              <div className="flex flex-col gap-2">
                {/* Framed inside the card: the dial's sky would otherwise blend into the page. */}
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  {dayMap}
                  {sun && <SunArc key={date ?? ""} plan={plan} profile={profile} sun={sun} hasDrive={hasDrive} byBus={transit} byTrain={transit && rail.status === "ok"} weather={weather.below} legend={false} />}
                </div>
                <DayMapLegend
                  colours={dayMap && profile ? trailColours(profile, plan.hikeStart.getTime(), plan.hikeEnd.getTime(), plan.sunset.getTime()) : []}
                  mode={walking ? "foot" : transit ? (rail.status === "ok" ? "train" : "bus") : "car"}
                  stopKinds={dayMap ? [...new Set(stops.flatMap((s) => (s.id === LUNCH.id ? ["obcerstvenie" as const] : walkProfile?.places?.find((p) => p.id === s.id)?.kind ?? [])))] : []}
                  map={!!dayMap}
                  sun={!!sun}
                  hasDrive={hasDrive}
                  late={plan.hikeEnd > plan.sunset}
                />
              </div>
            )}
            {plan.startsInDark && (
              <p className="flex items-start gap-1.5 text-sm text-[var(--warn)]">
                <UiIcon name="warn" size={16} className="mt-0.5" />
                <span>{t("Túra začína pred východom slnka, vezmite si čelovku.")}</span>
              </p>
            )}
            {/* Peter: the arrival is the first big time; the departure (also set in the box above) sits
                small over it, a chip set apart from the labels below it. */}
            {hasDrive && (
              <p className="font-data -mb-2.5 w-fit rounded-full bg-[var(--segment-bg)] px-2 py-0.5 text-[14px] leading-tight font-semibold">
                {t("odchod")} {formatTime(plan.segments[0].start)}
              </p>
            )}
            <ol className="font-data grid grid-cols-[repeat(4,auto)] justify-between gap-x-2 text-[1.3rem] leading-tight font-bold sm:text-[1.6rem]">
              <Step
                label={t(transit && stop ? "zastávka" : hasDrive ? (parking ? "parkovisko" : "na mieste") : "túra")}
                time={plan.hikeStart}
              />
              {profile && <Step label={t(GOAL_WORDS[profile.goalKind].noun)} time={goalTime(plan, profile)} approx />}
              {/* One line each on a phone (Peter): "späť na zastávke" wrapped. */}
              <Step label={t(transit && stop ? "na zastávke" : hasDrive ? "pri aute" : "späť")} time={plan.hikeEnd} />
              {plan.segments[plan.segments.length - 1].kind === "drive-back" && <Step label={t("doma")} time={plan.segments[plan.segments.length - 1].end} />}
            </ol>
            {/* The TANAP daylight rule is one of the recap's rows (same condition and words), so its separate box
                here is gone: it showed the same text twice in a row. */}
            <PlanWarningsRecap warnings={warnings} />
            {transit && <TransitLegs plan={plan} rail={rail} />}
            {transit && rail.status === "ok" && <p className="text-xs text-[var(--muted)]">{t("Podľa cestovného poriadku vlakov, spoj si vyberiete nižšie.")}</p>}
            {driveApprox && !transit && (
              <p className="text-xs text-[var(--muted)]">{t("Cestu autom teraz odhadujeme podľa vzdialenosti (~{t}).", { t: formatDuration(driveMin!) })}</p>
            )}
            {!start && !transit && <p className="text-xs text-[var(--muted)]">{t("Vyberte, odkiaľ vyrážate, a pridáme aj cestu autom.")}</p>}
          </section>
        )}

        </div>
        </PlanStepsProvider>
        </PlanDayProvider>
      </section>

      {/* Its own card (Peter, 2026-11-11): save, share, navigate and the GPX are what you do with a finished plan. Named "Uložiť a navigovať" (Peter, 2026-11-13; was "Vyraziť"). */}
      <section data-nosnippet aria-label={t("Uložiť a navigovať")} className={`${part} [&_a]:cursor-pointer [&_button:not(:disabled):not([aria-disabled])]:cursor-pointer`}>
        <h2 className="text-[1.35rem] leading-tight font-bold">{t("Uložiť a navigovať")}</h2>
        <SaveTripButton gpxUrl={gpxUrl} bbox={bbox} sun={sun} tripPlan={tripPlan} profile={profile} trail={trail} closures={closures} where={calendarPlace} {...trip} nav={<NavHandoff slug={trip.slug} drive={destination} start={start} walkFrom={walkStart} walk={walk} join={trailJoin} />} gpx={gpxAction} />
      </section>
      <AppPromo />

      {/* The "no closure data" box stands alone between the cards, not as a row among the trail's facts. */}
      {children}

      <section aria-label={t("Dobré vedieť pred výletom")} className={part}>
        <h2 className="px-1 text-base font-semibold text-[var(--foreground)]">{t("Dobré vedieť pred výletom")}</h2>

        {outro}
        <p className="text-xs text-[var(--muted)]">
          {t("Čo si overiť pred odchodom a kto platí záchranu:")}{" "}
          <LangLink href="/upozornenie" className="underline">
            {t("Upozornenie")}
          </LangLink>
        </p>
      </section>
    </div>
  );
}

/** Leaving before this hour is not a usual day out: asked about once (a mistyped "01:00" for "10:00"). */
const UNUSUAL_BEFORE_HOUR = 4;
/** What a night-time departure is changed to. */
const NIGHT_FIX = "08:00";

/** "Naozaj o 16:30?": change to the latest good start, or keep the odd time. */
/** "09:40" as the rest of the plan writes it: "9:40". Display only. */
const shortTime = (hhmm: string) => hhmm.replace(/^0/, "");

function UnusualTime({ time, text, better, onBetter, onKeep }: { time: string; text: string; better: string | null; onBetter: () => void; onKeep: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onKeep();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeep]);
  return (
    // In the middle of the screen, also on phones (Peter: a bottom sheet looked too unimportant).
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" role="alertdialog" aria-modal="true" aria-labelledby="unusual-time">
      <div className="absolute inset-0 bg-black/50" onClick={onKeep} />
      <div className="relative flex w-full max-w-[420px] flex-col gap-3 rounded-[20px] border-2 border-[var(--warn)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow-float)]">
        <h2 id="unusual-time" className="flex items-center gap-2 text-lg font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-[var(--warn)]" aria-hidden="true">
            <path d="M12 3 22 20H2z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M12 9.5v4.5M12 16.8v.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <span>
            {t("Naozaj o")} <span className="font-data">{shortTime(time)}</span>?
          </span>
        </h2>
        <p className="text-[15px]">{text}</p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          {better && (
            <button
              type="button"
              onClick={onBetter}
              autoFocus
              className="rounded-xl bg-[var(--accent)] px-4 py-3 text-[15px] font-bold text-[var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {t("Zmeniť na")} <span className="font-data">{shortTime(better)}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onKeep}
            autoFocus={!better}
            className="rounded-xl border border-[var(--border)] px-4 py-3 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {t("Ponechať")} <span className="font-data">{shortTime(time)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** One warning, in the words the trip page uses for each case. */
function lateText(
  verdict: Verdict,
  o: { latestPassed: boolean; tooLong: boolean; noTrain: boolean; startWord: string; latest: string },
  lang: Lang
): string {
  const t = (sk: string, vars?: Record<string, string>) => tr(lang, sk, vars);
  if (o.tooLong && o.noTrain) return t("Vlakom to v tento deň za svetla nestihnete: žiadny vlak nepríde dosť skoro. Skúste autobus, kratšiu trasu alebo iný deň.");
  if (o.tooLong) return t("Na tento deň je túra pridlhá, za svetla ju nestihnete. Skúste deň s dlhším svetlom alebo kratšiu trasu.");
  if (o.latestPassed) return t("Na dnes je to už neskoro, späť by ste boli po tme. Skúste zajtra ráno.");
  const leave = t("{start} najneskôr o {time}.", { start: o.startWord, time: o.latest });
  if (verdict === "tight") return t("Stihnete to tesne pred západom slnka. Pre rezervu {start} najneskôr o {time}.", { start: `${o.startWord.charAt(0).toLowerCase()}${o.startWord.slice(1)}`, time: o.latest });
  if (verdict === "after-dusk") return `${t("Späť by ste boli až po tme.")} ${leave}`;
  return `${t("Späť by ste boli po západe slnka.")} ${leave}`;
}

function Step({ label, time, approx = false }: { label: string; time: Date; approx?: boolean }) {
  return (
    // Bottom-aligned: labels of any length keep the times on one line.
    <li className="flex flex-col justify-end">
      <span className="block font-sans text-[13px] leading-tight font-medium whitespace-nowrap text-[var(--muted)]">{label}</span>
      <span>
        {approx ? "~" : ""}
        {formatTime(time)}
      </span>
    </li>
  );
}

