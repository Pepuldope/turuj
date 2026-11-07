import { COUNTED_HOSTS } from "@/lib/site";

// Product events sent to Umami (see components/Analytics.tsx). Umami sets no
// cookies and stores nothing on the device. Never put coordinates, typed
// places or anything personal into event data: a trail slug is the most.

/** Every event name in one place, so the dashboard stays tidy. */
export type AnalyticsEvent =
  | "start_set" // a start is known: GPS, a typed place, or one remembered from an earlier visit
  | "trip_open" // a trip page was viewed
  | "trip_saved" // "Uložiť výlet" tapped
  | "share" // "Zdieľať výlet" tapped
  | "share_sent" // the share sheet sent it, or the text was copied
  | "shared_open" // a friend opened a shared plan link
  | "gpx_download" // "Stiahnuť GPX trasu" tapped
  | "nav_open" // hand-off to Google Maps / a map app
  | "transit_open" // cp.sk link opened
  | "tester_signup_open" // "Chcem testovať" footer link tapped
  | "plus_want" // "Chcel by som to" on /plus (Túruj+ price test)
  | "plus_no" // "Za túto cenu nie" on /plus
  | "app_link" // "Získať appku" tapped: home bottom bar or after saving a trip
  | "app_installed" // Android install dialog accepted on /aplikacia
  | "on_trail" // "Kde som na trase?" tapped on a trip page
  | "plan_commit" // North Star: the first save, send, navigation or GPX for a trail in this page load (sent by track())
  | "heard_from" // one-tap "Ako ste sa o nás dozvedeli?" after the first saved trip on this device
  | "day_pick" // a day chosen in the day picker: dnes / zajtra / so / ne / iny
  | "trip_search" // a search on the home page was run: hit (something found) or miss
  | "trip_search_town"; // a known town was typed into the trip search (the "Vyrážam z …" row showed)

type EventData = Record<string, string | number | boolean>;

/** Also added to our own monthly totals (app/api/event, lib/eventCounts.ts), since Umami's free plan has no export. */
const KEPT: ReadonlySet<AnalyticsEvent> = new Set(["start_set", "trip_saved", "share_sent", "shared_open", "nav_open", "plus_want", "plus_no", "plan_commit", "heard_from"]);

/**
 * The actions that mean "this trip is planned", and the name each gives in plan_commit's `via`.
 * One plan often brings several (save, send, both navigation buttons): plan_commit counts it once
 * per trail per page load, so the North Star (planned trips a week) isn't counted four times.
 */
const COMMIT_VIA: Partial<Record<AnalyticsEvent, string>> = { trip_saved: "save", share_sent: "share", nav_open: "nav", gpx_download: "gpx" };
// In memory only: a new page load may count the same trail again, as the reports define it.
const committed = new Set<string>();

/** The channels heard_from may carry: fixed choices, so nothing typed is ever sent. */
export const HEARD_FROM = ["google", "ai", "facebook", "instagram", "tiktok", "kamarat", "skola", "klub", "ine"] as const;

declare global {
  interface Window {
    umami?: { track: (name: string, data?: EventData) => void };
  }
}

/**
 * How long since the visitor landed, as a coarse bucket ("0-2 min"), for the
 * "plan sent within two minutes" goal. Read from the page's own clock, which
 * keeps running across in-app navigation and stores nothing on the device.
 */
export function sinceArrival(): string {
  if (typeof performance === "undefined") return "unknown";
  const min = performance.now() / 60_000;
  if (min < 2) return "0-2 min";
  if (min < 5) return "2-5 min";
  if (min < 15) return "5-15 min";
  return "15+ min";
}

// Umami's own "don't count this browser" switch; our counters honour it too.
const OPT_OUT_KEY = "umami.disabled";

/**
 * "/statistiky?nepocitat=1" stops counting this browser (the team's own
 * phones), "?nepocitat=0" undoes it. Kept in this browser only. Only on
 * /statistiky, where the page says so: on any page, a shared link carrying
 * the flag would quietly stop counting everyone who opened it.
 */
export function applyOptOut(): void {
  try {
    if (window.location.pathname.replace(/\/$/, "") !== "/statistiky") return;
    const v = new URLSearchParams(window.location.search).get("nepocitat");
    if (v === "1") localStorage.setItem(OPT_OUT_KEY, "1");
    else if (v === "0") localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Storage blocked: nothing to remember.
  }
}

/** "Nepočítať ma" on /sukromie: a button, so no link can switch it for someone else. */
export function setOptedOut(off: boolean): void {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Storage blocked: nothing is remembered, and nothing to switch.
  }
}

export function optedOut(): boolean {
  try {
    return Boolean(localStorage.getItem(OPT_OUT_KEY));
  } catch {
    return false;
  }
}

/** Whether this page load may count: the real site, a person, not one of us. */
export function countsHere(): boolean {
  return COUNTED_HOSTS.includes(window.location.host) && !navigator.webdriver && !optedOut();
}

// Events from before Umami's script has loaded (it starts after the page is interactive): a shared
// link's "shared_open" fires on the first render and was lost. They wait here, up to UMAMI_WAIT_MS.
const UMAMI_WAIT_MS = 15_000;
const waiting: [string, EventData | undefined][] = [];
let waitTimer: ReturnType<typeof setInterval> | null = null;

function sendToUmami(name: string, data?: EventData): void {
  if (window.umami) {
    window.umami.track(name, data);
    return;
  }
  waiting.push([name, data]);
  if (waitTimer) return;
  const since = Date.now();
  waitTimer = setInterval(() => {
    const umami = window.umami;
    if (!umami && Date.now() - since < UMAMI_WAIT_MS) return;
    clearInterval(waitTimer!);
    waitTimer = null;
    const queued = waiting.splice(0);
    // Blocked or never loaded: drop them, as before.
    if (umami) for (const [n, d] of queued) umami.track(n, d);
  }, 500);
}

function keep(name: AnalyticsEvent, detail: string): void {
  const body = JSON.stringify({ name, detail });
  if (!navigator.sendBeacon?.("/api/event", body)) {
    fetch("/api/event", { method: "POST", body, keepalive: true }).catch(() => {});
  }
}

/** Send one event. Silently does nothing when Umami isn't loaded or is blocked. */
export function track(name: AnalyticsEvent, data?: EventData): void {
  if (typeof window === "undefined") return;
  try {
    sendToUmami(name, data);
    const counts = countsHere();
    if (KEPT.has(name) && counts) keep(name, String(data?.took ?? data?.how ?? data?.ch ?? ""));
    const via = COMMIT_VIA[name];
    const trail = data?.trail;
    if (via && typeof trail === "string" && !committed.has(trail)) {
      committed.add(trail);
      sendToUmami("plan_commit", { via, trail, took: sinceArrival() });
      if (counts) keep("plan_commit", via);
    }
  } catch {
    // Analytics must never break the app.
  }
}

/** How a start came about, for start_set's `how`; never where. */
export type StartHow = "suggestion" | "typed" | "town_button" | "map_pick" | "gps" | "remembered" | "town_page";
