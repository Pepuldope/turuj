"use client";

import { UiIcon } from "@/components/UiIcon";
import { useEffect, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";
import { EVE_MAX_AHEAD_MS, closedUntilFor, eveAtFor, eveWanted } from "@/lib/eve";
import type { EveJob } from "@/lib/eve";
import { appleKind, buildIcs, googleCalendarUrl } from "@/lib/ics";
import type { IcsTrip } from "@/lib/ics";
import { track } from "@/lib/analytics";
import { currentSub, lastPushError, post, subscribe, support } from "@/components/TrailReminders";
import type { Support } from "@/components/TrailReminders";
import type { SavedTrip } from "@/lib/savedTrips";
import type { DayPlan } from "@/lib/dayPlan";
import type { Closure, LatLng } from "@/lib/types";
import { zonedDate } from "@/lib/zoned";

// Under the saved trip: the switch for the evening-before reminder (a push at 19:00, lib/eve.ts) and
// "Pridať do kalendára" for everyone. An iPhone outside the installed app has no web push, so it only
// gets the calendar.

/** A calendar button, small enough for the label and both buttons on one row at 360 px. */
const compact =
  "inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 text-sm font-semibold whitespace-nowrap hover:border-[var(--accent)]";

type State = "idle" | "busy" | "denied" | "failed" | "noservice";

/** What was last sent to the server per trip, kept across the question and the switch below it (they mount in turn). */
const sentFor = new Map<string, string>();

export function EveReminder({
  trip,
  plan,
  sun,
  closures,
  where,
  onChange,
  ask = false,
  onAsked,
}: {
  trip: SavedTrip;
  plan: DayPlan | null;
  sun: LatLng | null;
  closures: Closure[];
  /** Where the walk starts (parking, stop or trailhead), for the event's place; the trip name without it. */
  where?: { name: string; location: LatLng } | null;
  onChange: (eve: boolean) => void;
  /** Right after saving: asked as a question in the green box ("Zapnúť pripomienku" / "Teraz nie") instead of the switch. */
  ask?: boolean;
  /** The question is answered (or there is nothing to ask). */
  onAsked?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [can, setCan] = useState<Support>("no");
  const [state, setState] = useState<State>("idle");
  const [now] = useState(() => Date.now());
  const [test, setTest] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [apple, setApple] = useState<"iphone" | "mac" | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCan(support());
    setApple(appleKind(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  const at = eveWanted(trip.date, now);
  // The plan on the page is the saved one only while the day agrees.
  const job: EveJob | null =
    sun && plan && at !== null && sameDay(plan.hikeStart, trip.date)
      ? {
          name: trip.name,
          slug: trip.slug,
          lang,
          lat: Math.round(sun.lat * 1e4) / 1e4,
          lon: Math.round(sun.lon * 1e4) / 1e4,
          from: plan.hikeStart.getTime(),
          to: plan.hikeEnd.getTime(),
          leave: plan.noTrainInLight ? null : plan.latestStart.getTime(),
          closedUntil: closedUntilFor(trip.date, closures),
        }
      : null;
  const jobKey = job ? JSON.stringify([job, trip.date]) : "";

  /** Tells the server (permission already given). */
  async function register(): Promise<boolean> {
    if (!job) return false;
    const sub = await subscribe();
    return post({ action: "eve", sub: sub.toJSON(), slug: trip.slug, name: trip.name, lang, date: trip.date, job });
  }

  async function plant(): Promise<boolean> {
    if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") {
      setState("denied");
      return false;
    }
    return register();
  }

  // First time on a device that already allowed notifications: on by default. Later changes of the plan are sent again.
  useEffect(() => {
    if (can !== "ok" || !job || trip.eve === false || sentFor.get(trip.slug) === jobKey) return;
    if (trip.eve === undefined && Notification.permission !== "granted") return;
    sentFor.set(trip.slug, jobKey);
    register().then(
      (ok) => {
        if (!ok) return;
        if (trip.eve !== true) {
          onChange(true);
          track("eve_planned", { trail: trip.slug, how: "auto" });
        }
      },
      () => {}
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can, jobKey, trip.eve]);

  /** Switches the reminder over; true when it is on afterwards. */
  async function toggle(): Promise<boolean> {
    setState("busy");
    try {
      if (trip.eve === true) {
        const sub = await currentSub();
        if (sub) await post({ action: "eve-cancel", sub: sub.toJSON(), slug: trip.slug });
        onChange(false);
        setState("idle");
        return false;
      }
      if (!(await plant())) {
        setDetail(lastPushError);
        setState((s) => (s === "denied" ? s : "failed"));
        return false;
      }
      sentFor.set(trip.slug, jobKey);
      onChange(true);
      track("eve_planned", { trail: trip.slug, how: ask ? "ask" : "switch" });
      setState("idle");
      return true;
    } catch (err) {
      setDetail(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      // The browser could not reach its own push service (Brave and some others have none): trying again won't help.
      setState(err instanceof Error && err.name === "AbortError" && /push service/i.test(err.message) ? "noservice" : "failed");
      return false;
    }
  }

  async function sendTest() {
    if (!job) return;
    try {
      const sub = await subscribe();
      const ok = await post({ action: "eve-test", sub: sub.toJSON(), slug: trip.slug, name: trip.name, lang, job });
      setTest(ok ? t("Skúšobná pripomienka odoslaná.") : t("Skúšobnú pripomienku sa nepodarilo poslať."));
    } catch {
      setTest(t("Skúšobnú pripomienku sa nepodarilo poslať."));
    }
  }

  /** The event as the .ics and the Google link both write it. */
  function eventOf(): IcsTrip {
    const [y, m, d] = trip.date.split("-").map(Number);
    const [hh, mm] = trip.time.split(":").map(Number);
    const start = Number.isFinite(hh) ? zonedDate(y, m, d, hh, mm).getTime() : null;
    const end = plan && sameDay(plan.hikeStart, trip.date) ? plan.hikeEnd.getTime() : null;
    return {
      name: trip.name,
      url: `${window.location.origin}${langPath(lang, `/trasa/${trip.slug}`)}`,
      date: trip.date,
      startMs: start,
      endMs: end,
      lang,
      uid: `${trip.slug}-${trip.date}@turuj.sk`,
      stampMs: Date.now(),
      location: where?.name ?? trip.name,
      geo: where ? { lat: where.location.lat, lon: where.location.lon } : null,
    };
  }

  function download() {
    const ics = buildIcs(eventOf());
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `turuj-${trip.slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    track("ics_download", { trail: trip.slug });
  }

  const on = trip.eve === true;
  const showSwitch = can === "ok" && job !== null;
  // A day the reminder can't reach (19:00 the day before has passed, or more than 8 days ahead): the switch
  // stays, washed out and explained, instead of quietly missing (design brief: impossible choices are shown).
  const evening = eveAtFor(trip.date);
  const offReason =
    can !== "ok" || job !== null || evening === null
      ? null
      : evening <= now
        ? t("Pripomienka chodí o 19:00 deň pred výletom, na tento deň je už neskoro. Pridajte si výlet do kalendára.")
        : evening >= now + EVE_MAX_AHEAD_MS
          ? t("Pripomienku môžete zapnúť najskôr 8 dní pred výletom.")
          : null;
  const testing = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("eve-test") === "1";

  const warning =
    state === "denied"
      ? t("Upozornenia sú v prehliadači zakázané. Povoľte ich v nastaveniach stránky alebo použite kalendár.")
      : state === "noservice"
        ? t("Tento prehliadač teraz upozornenia nastaviť nevie. Použite kalendár alebo iný prehliadač.")
        : state === "failed"
          ? t("Pripomienku sa teraz nepodarilo nastaviť. Skúste to znova alebo použite kalendár.")
          : null;
  const calendarRow = (
    // One row, even at 360 px: the label says what it is, the buttons only say where.
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-sm font-semibold">{t("Pridať do kalendára")}</span>
      <button type="button" onClick={download} aria-label={apple ? t("Do Apple Kalendára") : t("Do iného kalendára (súbor .ics)")} className={compact}>
        {apple ? "Apple" : t("Iný")}
      </button>
      <a
        // Built from the saved day and time on every render (this card only exists in the browser, after a save),
        // so a long-press or "open in new tab" carries the event too.
        href={typeof window === "undefined" ? "https://calendar.google.com/calendar/render" : googleCalendarUrl(eventOf())}
        target="_blank"
        rel="noopener"
        aria-label={t("Do Google Kalendára")}
        onClick={() => track("ics_download", { trail: trip.slug, to: "google" })}
        className={compact}
      >
        Google
      </a>
    </div>
  );

  // The question in the green box right after saving (Peter, 18 Nov). Where Túruj can send the reminder: one big
  // button; where it can't (an iPhone outside the installed app, a day too near or too far): the calendar instead.
  if (ask) {
    const later = (
      <button type="button" onClick={onAsked} className="min-h-10 px-2 text-sm underline">
        {t("Teraz nie")}
      </button>
    );
    // Already on (this device allowed notifications before): say so, with the way out.
    if (on)
      return (
        <p>
          {t("Napíšeme vám o 19:00 deň vopred: počasie a kedy vyraziť.")}{" "}
          <button type="button" disabled={state === "busy"} onClick={() => void toggle().then(() => onAsked?.())} className="underline">
            {t("Zrušiť pripomienku")}
          </button>
        </p>
      );
    if (showSwitch)
      return (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{t("Pripomenúť večer pred výletom?")}</p>
          <p>{t("Napíšeme vám o 19:00 deň vopred: počasie a kedy vyraziť.")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={state === "busy"}
              onClick={() => void toggle().then((ok) => ok && onAsked?.())}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] disabled:opacity-60"
            >
              <UiIcon name="clock" size={16} />
              {t("Zapnúť pripomienku")}
            </button>
            {later}
          </div>
          {warning && (
            <>
              <p className="flex items-start gap-1.5 text-xs text-[var(--warn)]"><UiIcon name="warn" size={14} className="mt-px" /><span>{warning}</span></p>
              {calendarRow}
            </>
          )}
        </div>
      );
    return (
      <div className="flex flex-col gap-2">
        <p className="font-semibold">{t("Pripomenúť výlet z kalendára?")}</p>
        {offReason ? <p>{offReason}</p> : can === "iphone-browser" && <p>{t("Na iPhone príde pripomienka z kalendára. Upozornenia od Túruja fungujú po pridaní na plochu.")}</p>}
        {calendarRow}
        <div>{later}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {showSwitch && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={toggle}
            disabled={state === "busy"}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-left text-sm font-semibold disabled:opacity-60"
          >
            <span
              aria-hidden
              className={`relative h-6 w-10 shrink-0 rounded-full ${on ? "bg-[var(--accent)]" : "bg-[var(--muted)]"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--card-bg)] transition-all motion-reduce:transition-none ${on ? "left-[18px]" : "left-0.5"}`} />
            </span>
            <span>{t("Pripomenúť večer pred výletom")}</span>
          </button>
          {on && <p className="text-xs text-[var(--muted)]">{t("Napíšeme vám o 19:00 deň vopred: počasie a kedy vyraziť.")}</p>}
          {warning && <p className="flex items-start gap-1.5 text-xs text-[var(--warn)]"><UiIcon name="warn" size={14} className="mt-px" /><span>{warning}</span></p>}
          {testing && on && (
            <button type="button" onClick={sendTest} className="self-start text-xs underline">
              {t("Poslať skúšobnú pripomienku teraz")}
            </button>
          )}
          {test && <p className="text-xs text-[var(--muted)]">{test}</p>}
          {testing && detail && <p className="text-xs break-words text-[var(--muted)]">Detail: {detail}</p>}
        </div>
      )}
      {offReason && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            role="switch"
            aria-checked={false}
            aria-disabled
            disabled
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-left text-sm font-semibold text-[var(--muted)] line-through opacity-60"
          >
            <span aria-hidden className="relative h-6 w-10 shrink-0 rounded-full bg-[var(--muted)]">
              <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-[var(--card-bg)]" />
            </span>
            <span>{t("Pripomenúť večer pred výletom")}</span>
          </button>
          <p className="text-xs text-[var(--muted)]">{offReason}</p>
        </div>
      )}
      {calendarRow}
      {can === "iphone-browser" && (
        <p className="text-xs text-[var(--muted)]">{t("Na iPhone príde pripomienka z kalendára. Upozornenia od Túruja fungujú po pridaní na plochu.")}</p>
      )}
    </div>
  );
}

function sameDay(at: Date, iso: string): boolean {
  const w = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava" }).format(at);
  return w === iso;
}
