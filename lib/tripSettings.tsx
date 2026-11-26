"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { addDaysIso, isoDate } from "@/lib/days";
import { wallClock } from "@/lib/zoned";
import "@/lib/legacyStorage";

/** The trip inputs, shared by the home list and every trip page so nothing resets on navigation. */
export interface TripSettings {
  /** The picked day, YYYY-MM-DD; null = no day picked (home lists every trip). */
  date: string | null;
  /** Departure HH:MM chosen on a trip page; null = the default for the day. */
  time: string | null;
  /** Kids along: the walk is timed at a slower pace. */
  withKids: boolean;
  /** Only trips marked suitable for kids: on with `withKids` (one switch, Peter 2026-10-27); the empty list can let it go. */
  easier: boolean;
  /** How the group gets there: by car, or by train/bus (then the plan starts at the stop). */
  travel: Travel;
}

export type Travel = "car" | "transit";

interface TripSettingsState extends TripSettings {
  /** Today's date in the visitor's timezone; null until hydrated (the server has no "now"). */
  today: string | null;
  update: (patch: Partial<TripSettings>) => void;
  /** A saved plan is opened: its day and the rest take over, and the day the lists showed is kept to come back to (giveDayBack). */
  openPlan: (patch: Partial<TripSettings>) => void;
  /** Back on a list of trips after a saved plan was opened: the list's own day again. Does nothing otherwise. */
  giveDayBack: () => void;
}

// v3: earlier versions stored "today" as the default day; starting fresh makes Zajtra the default for them too.
const STORAGE_KEY = "turuj-trip-v3";
/** After this hour "now" makes a poor default departure: plan tomorrow morning instead. */
const LATE_HOUR = 15;
const MORNING = "08:00";
/** Before this hour "now" is still night: plan this morning at 08:00 instead of leaving in the dark. */
const EARLY_HOUR = 6;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Now rounded up to the next quarter hour; 08:00 when it's still night; tomorrow 08:00 when it's already late. */
export function defaultDeparture(now = new Date()): { date: string; time: string } {
  // Slovak clock, whatever the device's timezone.
  const d = new Date(Math.ceil(now.getTime() / (15 * 60000)) * 15 * 60000);
  const at = wallClock(d);
  if (at.h >= LATE_HOUR || isoDate(d) !== isoDate(now)) return { date: addDaysIso(isoDate(now), 1), time: MORNING };
  if (at.h < EARLY_HOUR) return { date: isoDate(d), time: MORNING };
  return { date: isoDate(d), time: `${pad(at.h)}:${pad(at.mi)}` };
}

/** True when `time` on `date` is already in the past (Slovak clock). */
export function timeGone(date: string | null, time: string, now = new Date()): boolean {
  if (!date) return false;
  const today = isoDate(now);
  if (date !== today) return date < today;
  const at = wallClock(now);
  return time <= `${pad(at.h)}:${pad(at.mi)}`;
}

/** Default departure on a given day: soon if it's today, else 08:00. */
export function defaultTimeFor(date: string, now = new Date()): string {
  const soon = defaultDeparture(now);
  return soon.date === date ? soon.time : MORNING;
}

/** The day a visit starts on: tomorrow, so the whole day's trips show; today is one tap away. */
export function defaultDay(now = new Date()): string {
  return addDaysIso(isoDate(now), 1);
}

const DEFAULTS: TripSettings = { date: null, time: null, withKids: false, easier: false, travel: "car" };

function readStored(): Partial<TripSettings> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<TripSettings>) : null;
  } catch {
    return null;
  }
}

function store(s: TripSettings) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: settings just reset on reload.
  }
}

// Opening a saved plan shows its day on the trip page, but must not change the day the home list shows
// (Peter, 26 Nov 2026: he opened a plan for today, went back to the home page, and its day was "today" although
// it was already late). So the day and time from before the plan are kept here until a list of trips is shown
// again. A day the visitor then picks on the trip page is their own choice and stays.
const LENT_KEY = "turuj-trip-lent";

type Lent = Pick<TripSettings, "date" | "time">;

function readLent(): Lent | null {
  try {
    const raw = sessionStorage.getItem(LENT_KEY);
    return raw ? (JSON.parse(raw) as Lent) : null;
  } catch {
    return null;
  }
}

function storeLent(lent: Lent | null) {
  try {
    if (lent) sessionStorage.setItem(LENT_KEY, JSON.stringify(lent));
    else sessionStorage.removeItem(LENT_KEY);
  } catch {
    // Storage blocked: the plan's day then stays, as before.
  }
}

/** The day and time the lists go back to after a plan was open: the ones from before it, or the default day when that day has passed. */
export function dayToGiveBack(lent: Lent, now = new Date()): Lent {
  const date = lent.date && lent.date >= isoDate(now) ? lent.date : defaultDay(now);
  const time = date === lent.date && lent.time && !timeGone(date, lent.time, now) ? lent.time : null;
  return { date, time };
}

// Car or not is a fact about the visitor, not about one visit: remembered across visits.
const TRAVEL_KEY = "turuj-travel";

function readTravel(): Travel | null {
  try {
    const v = localStorage.getItem(TRAVEL_KEY);
    return v === "car" || v === "transit" ? v : null;
  } catch {
    return null;
  }
}

function storeTravel(t: Travel) {
  try {
    localStorage.setItem(TRAVEL_KEY, t);
  } catch {
    // Storage blocked: back to the car default next visit.
  }
}

const TripSettingsContext = createContext<TripSettingsState>({ ...DEFAULTS, today: null, update: () => {}, openPlan: () => {}, giveDayBack: () => {} });

export function TripSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TripSettings>(DEFAULTS);
  const [today, setToday] = useState<string | null>(null);

  // "Now" and storage only exist in the browser: fill them in after hydration.
  useEffect(() => {
    const stored = readStored();
    const now = isoDate(new Date());
    // A stored day in the past is stale (tab left open overnight): forget it and its time.
    const stale = !!stored?.date && stored.date < now;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(now);
    const travel = readTravel();
    // A new visit plans for tomorrow. A day is never left un-picked (Peter, 16 Nov): one stored as un-picked by the
    // old second-tap toggle starts on tomorrow too.
    const fresh = !stored?.date || stale;
    const merged = { ...DEFAULTS, ...stored, ...(fresh ? { date: defaultDay(), time: null } : {}), ...(travel ? { travel } : {}) };
    // The old separate "easier trips" switch is gone: without kids, nothing narrows the list.
    setSettings(merged.withKids ? merged : { ...merged, easier: false });
  }, []);

  // A tab left open past midnight: "Dnes" moves to the new day, and a day now in the past
  // goes back to the default, as on a new visit. Checked when the tab comes back and each minute.
  useEffect(() => {
    if (!today) return;
    const check = () => {
      const now = isoDate(new Date());
      if (now === today) return;
      setToday(now);
      setSettings((prev) => (prev.date && prev.date < now ? { ...prev, date: defaultDay(), time: null } : prev));
    };
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [today]);

  const update = useCallback((patch: Partial<TripSettings>) => {
    if (patch.travel) storeTravel(patch.travel);
    // A day picked by hand while a plan is open is the visitor's own: nothing to give back any more.
    if (patch.date !== undefined && patch.date !== readStored()?.date) storeLent(null);
    setSettings((prev) => {
      // A new day keeps the picked departure and every other choice (Peter, 2026-10-26),
      // unless that time has already gone by today.
      const next = { ...prev, ...patch };
      if (patch.date !== undefined && patch.date !== prev.date && patch.time === undefined && next.time && timeGone(next.date, next.time)) next.time = null;
      store(next);
      return next;
    });
  }, []);

  const openPlan = useCallback((patch: Partial<TripSettings>) => {
    if (patch.travel) storeTravel(patch.travel);
    // The first plan opened keeps the lists' day; a second one opened after it must not keep the first plan's.
    if (!readLent()) {
      const before = readStored();
      storeLent({ date: before?.date ?? null, time: before?.time ?? null });
    }
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      store(next);
      return next;
    });
  }, []);

  // Works on the stored copy first: on a full page load this runs before the settings are read from storage above.
  const giveDayBack = useCallback(() => {
    const lent = readLent();
    if (!lent) return;
    storeLent(null);
    const back = dayToGiveBack(lent);
    store({ ...DEFAULTS, ...readStored(), ...back });
    setSettings((prev) => ({ ...prev, ...back }));
  }, []);

  const value = useMemo(() => ({ ...settings, today, update, openPlan, giveDayBack }), [settings, today, update, openPlan, giveDayBack]);
  return <TripSettingsContext.Provider value={value}>{children}</TripSettingsContext.Provider>;
}

export function useTripSettings(): TripSettingsState {
  return useContext(TripSettingsContext);
}

/** For a page that lists trips by day (home, a town's trips): the list's own day comes back after a saved plan was open. */
export function useOwnDay() {
  const { giveDayBack } = useTripSettings();
  useEffect(() => {
    giveDayBack();
    // A page brought back whole by the browser's back button does not mount again.
    const onShow = (e: PageTransitionEvent) => e.persisted && giveDayBack();
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [giveDayBack]);
}

/**
 * The day and departure a trip page plans for: the picked day (else today, or
 * tomorrow when it's late) and the chosen time (else a sensible default).
 * Both null until hydrated.
 */
export function useTripDay(): { date: string | null; time: string | null; picked: boolean } {
  const { date, time, today } = useTripSettings();
  return useMemo(() => {
    if (!today) return { date: null, time: null, picked: false };
    const day = date ?? defaultDeparture().date;
    return { date: day, time: time ?? defaultTimeFor(day), picked: date !== null };
  }, [date, time, today]);
}
