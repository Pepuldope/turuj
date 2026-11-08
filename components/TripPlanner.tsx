"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DayPlan, Verdict } from "@/lib/dayPlan";
import { EARLIEST_DEPARTURE_HOUR, dayAfterNa, dayStrip, floorTo5, longDay } from "@/lib/days";
import { badDays } from "@/lib/weather";
import { formatDuration, formatTime, stopLabel } from "@/lib/format";
import { haversineM } from "@/lib/geo";
import { walkThereMinutes } from "@/lib/walkThere";
import { parkingPlace, readSharedPlan } from "@/lib/links";
import { track } from "@/lib/analytics";
import type { SharedPlan, WalkRoute } from "@/lib/links";
import { useTripSettings } from "@/lib/tripSettings";
import { useTripPlan } from "@/lib/useTripPlan";
import { useUserLocation } from "@/lib/userLocation";
import { clock, hourOf, zonedDate } from "@/lib/zoned";
import type { BBox, Closure, LatLng } from "@/lib/types";
import { FilterChips, KidsRow } from "@/components/FilterChips";
import { NavHandoff } from "@/components/NavHandoff";
import { SaveTripButton } from "@/components/SaveTripButton";
import type { ShareInfo } from "@/components/ShareButton";
import { StartChip } from "@/components/StartChip";
import { StartPill } from "@/components/StartPill";
import { StopsRow } from "@/components/StopsRow";
import { SunArc } from "@/components/SunArc";
import { useTripAccess } from "@/components/TripAccess";
import { WeatherReport, useTripWeather } from "@/components/WeatherBlock";
import { TransitHandoff, TransitLegs } from "@/components/TransitBlock";
import { TravelSwitch } from "@/components/TravelSwitch";
import { GOAL_WORDS, trimProfile, withApproach, withStops } from "@/lib/tripProfile";
import { LUNCH, STAY_MIN, keepStopsOf, stopsMinutes, useTripStops } from "@/lib/tripStops";
import type { LunchPick } from "@/components/StopsRow";
import type { PauseAt, TripProfile } from "@/lib/tripProfile";
import { useLang, useT } from "@/lib/i18n";
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
  /** Shown between the plan and Uložiť: parking, the map, fees... (Uložiť and navigation come last). */
  children?: ReactNode;
  /** Under Uložiť and navigation, in the last card. */
  outro?: ReactNode;
  /** The trip has places on or near the walk that can be added as stops. */
  hasPlaces?: boolean;
  /** The walk, kept with the saved trip for the trail screen ("Začať výlet"). */
  trail?: SavedTrail;
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

export function TripPlanner({ sun, goal, profile: fullProfile, gpxUrl, bbox, closures = [], walk, intro, children, outro, hasPlaces = false, trail, ...trip }: Props) {
  const { start } = useUserLocation();
  const { today, update } = useTripSettings();
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
  const { stops } = useTripStops(trip.slug);
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
  const startWord = hasDrive || walking ? t("Vyrazte") : transit && stop ? t("Buďte na zastávke {stop}", { stop: stopLabel(stop.name) }) : t("Začnite túru");

  // A time picked by hand that is far off a usual day out (back only in the dark, or leaving in the
  // middle of the night) is asked about once: change it to the latest good start, or keep it.
  const [asked, setAsked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const unusual =
    plan !== null &&
    !tripPlan.loading &&
    (plan.verdict === "after-dusk" || hourOf(plan.segments[0].start) < UNUSUAL_BEFORE_HOUR);
  useEffect(() => {
    if (!asked || asked !== time) return;
    // Wait for the typing (and the route) to settle; the question is about the final time.
    const timer = setTimeout(() => {
      if (unusual) setConfirm(asked);
      setAsked(null);
    }, 800);
    return () => clearTimeout(timer);
  }, [asked, time, unusual]);
  const better = latest && !tooLong && !latestPassed ? formatTime(latest) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* First thing under the header: where the day is planned from, changeable without scrolling. */}
      <div data-nosnippet className="flex items-center gap-2">
        <StartPill />
      </div>
      {/* Three cards, so the eye takes one step at a time:
          plan the trip, see the day, then get there. */}
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

        {/* In the order of the day: where from, how, which day and time. */}
        {/* F9: interactive planner chrome stays out of Google's snippets (data-nosnippet); `contents` keeps the layout. */}
        <div data-nosnippet className="contents">
          <StartChip />

          <TravelSwitch roadMin={roadMin} trainMin={rail.status === "ok" ? driveMin : null} noCar={noCar} noBus={noBus} walkMin={walkThere} walking={walking} onWalk={setOnFoot} />
          {transit && <TransitHandoff />}

          {/* Kids along, in the plan itself (Peter 2026-10-22: the pill above the card went unnoticed on a phone). */}
          <KidsRow />
        </div>

        <section data-nosnippet aria-label={t("Deň a odchod")} className="flex flex-col gap-3">
          <FilterChips variant="trip" activeDate={date} dayWeather={dayWeather} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              {hasDrive || walking ? t("Odchod") : transit && stop ? t("Na zastávke") : t("Začiatok túry")}
              <input
                type="time"
                step={300}
                value={time ?? ""}
                onChange={(e) => {
                  if (!e.target.value) return;
                  update({ time: e.target.value });
                  setAsked(e.target.value);
                }}
                className="font-data w-32 rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-3 py-1.5 text-lg"
              />
            </label>
          </div>
          {/* Right under the time it is about (Peter). Not from the quick guess shown while the route loads:
              a warning that then vanishes would only confuse. */}
          {plan && !tripPlan.loading && (late || latestPassed) && (
            <p role="status" className="rounded-xl bg-[var(--warn-bg)] px-3.5 py-3 text-base font-semibold text-[var(--warn)]">
              {lateText(plan.verdict, { latestPassed: !!latestPassed, tooLong, noTrain: !!plan.noTrainInLight, startWord, latest: formatTime(latest!) }, lang)}
            </p>
          )}
          {driveStatus === "loading" && !walking && <p className="text-xs text-[var(--muted)]">{transit ? t("Počítame cestu na zastávku…") : t("Počítame cestu autom…")}</p>}
        </section>
      </section>

      {confirm && plan && (
        <UnusualTime
          time={confirm}
          text={
            late || latestPassed
              ? lateText(plan.verdict, { latestPassed: !!latestPassed, tooLong, noTrain: !!plan.noTrainInLight, startWord, latest: better ?? "" }, lang)
              : t("To je uprostred noci, cesta by začínala po tme. Nemysleli ste ráno?")
          }
          better={late || latestPassed ? better : NIGHT_FIX}
          onBetter={() => {
            update({ time: better! });
            setConfirm(null);
          }}
          onKeep={() => setConfirm(null)}
        />
      )}

      {plan && (
        <section data-nosnippet aria-label={t("Priebeh dňa")} className={part}>
          {sun && (
            // Framed inside the card: its sky would otherwise blend into the page.
            <div className="overflow-hidden rounded-xl">
              <SunArc key={date ?? ""} plan={plan} profile={profile} sun={sun} hasDrive={hasDrive} byBus={transit} byTrain={transit && rail.status === "ok"} weather={weather.below} />
            </div>
          )}
          {plan.startsInDark && <p className="text-sm text-[var(--warn)]">{t("Túra začína pred východom slnka, vezmite si čelovku.")}</p>}
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
          <StopsRow slug={trip.slug} hasPlaces={hasPlaces} loop={!!walkProfile?.loop} lunch={lunch} />
          <WeatherReport plan={plan} weather={weather} goal={goal} wholeDay={transit} sunAt={sun} closures={closures} onPickDay={(iso) => update({ date: iso })} onPickTime={(time) => update({ time })} />
          {transit && <TransitLegs plan={plan} rail={rail} />}
          {transit && rail.status === "ok" && <p className="text-xs text-[var(--muted)]">{t("Podľa cestovného poriadku vlakov, spoj si vyberiete nižšie.")}</p>}
          {driveApprox && !transit && (
            <p className="text-xs text-[var(--muted)]">{t("Cestu autom teraz odhadujeme podľa vzdialenosti (~{t}).", { t: formatDuration(driveMin!) })}</p>
          )}
          {!start && !transit && <p className="text-xs text-[var(--muted)]">{t("Vyberte, odkiaľ vyrážate, a pridáme aj cestu autom.")}</p>}
        </section>
      )}

      <section aria-label={t("Na mieste")} className={part}>
        {children}

        <section data-nosnippet aria-label={t("Uložiť a zdieľať")} className="flex flex-col gap-3">
          <SaveTripButton gpxUrl={gpxUrl} bbox={bbox} sun={sun} tripPlan={tripPlan} profile={profile} trail={trail} closures={closures} where={calendarPlace} {...trip} />
          <NavHandoff slug={trip.slug} drive={destination} start={start} walkFrom={walkStart} walk={walk} join={trailJoin} />
        </section>

        {outro}
      </section>
    </div>
  );
}

/** Leaving before this hour is not a usual day out: asked about once (a mistyped "01:00" for "10:00"). */
const UNUSUAL_BEFORE_HOUR = 4;
/** What a night-time departure is changed to. */
const NIGHT_FIX = "08:00";

/** "Naozaj o 16:30?": change to the latest good start, or keep the odd time. */
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
            {t("Naozaj o")} <span className="font-data">{time}</span>?
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
              {t("Zmeniť na")} <span className="font-data">{better}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onKeep}
            autoFocus={!better}
            className="rounded-xl border border-[var(--border)] px-4 py-3 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {t("Ponechať")} <span className="font-data">{time}</span>
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
  if (o.tooLong) return t("V tento deň je táto túra na denné svetlo pridlhá. Skúste deň s dlhším svetlom alebo si vyberte kratšiu trasu.");
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

/** When the walk reaches its goal (peak, lake, castle...). */
function goalTime(plan: DayPlan, profile: TripProfile): Date {
  const at = profile.points[profile.goalIndex].at;
  return new Date(plan.hikeStart.getTime() + at * (plan.hikeEnd.getTime() - plan.hikeStart.getTime()));
}

