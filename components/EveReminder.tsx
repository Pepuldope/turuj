"use client";

import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { langPath } from "@/lib/lang";
import { closedUntilFor, eveWanted } from "@/lib/eve";
import type { EveJob } from "@/lib/eve";
import { buildIcs } from "@/lib/ics";
import { track } from "@/lib/analytics";
import { currentSub, post, subscribe, support } from "@/components/TrailReminders";
import type { Support } from "@/components/TrailReminders";
import type { SavedTrip } from "@/lib/savedTrips";
import type { DayPlan } from "@/lib/dayPlan";
import type { Closure, LatLng } from "@/lib/types";
import { zonedDate } from "@/lib/zoned";

// Under the saved trip: the switch for the evening-before reminder (a push at 19:00, lib/eve.ts) and
// "Pridať do kalendára" for everyone. An iPhone outside the installed app has no web push, so it only
// gets the calendar.

const secondary =
  "rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent)] disabled:opacity-60";

type State = "idle" | "busy" | "denied" | "failed";

export function EveReminder({
  trip,
  plan,
  sun,
  closures,
  onChange,
}: {
  trip: SavedTrip;
  plan: DayPlan | null;
  sun: LatLng | null;
  closures: Closure[];
  onChange: (eve: boolean) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [can, setCan] = useState<Support>("no");
  const [state, setState] = useState<State>("idle");
  const [now] = useState(() => Date.now());
  const [test, setTest] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCan(support());
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
  const sent = useRef("");
  useEffect(() => {
    if (can !== "ok" || !job || trip.eve === false || sent.current === jobKey) return;
    if (trip.eve === undefined && Notification.permission !== "granted") return;
    sent.current = jobKey;
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

  async function toggle() {
    setState("busy");
    try {
      if (trip.eve === true) {
        const sub = await currentSub();
        if (sub) await post({ action: "eve-cancel", sub: sub.toJSON(), slug: trip.slug });
        onChange(false);
        return setState("idle");
      }
      if (!(await plant())) return setState((s) => (s === "denied" ? s : "failed"));
      sent.current = jobKey;
      onChange(true);
      track("eve_planned", { trail: trip.slug, how: "switch" });
      setState("idle");
    } catch {
      setState("failed");
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

  function download() {
    const [y, m, d] = trip.date.split("-").map(Number);
    const [hh, mm] = trip.time.split(":").map(Number);
    const start = Number.isFinite(hh) ? zonedDate(y, m, d, hh, mm).getTime() : null;
    const end = plan && sameDay(plan.hikeStart, trip.date) ? plan.hikeEnd.getTime() : null;
    const ics = buildIcs({
      name: trip.name,
      url: `${window.location.origin}${langPath(lang, `/trasa/${trip.slug}`)}`,
      date: trip.date,
      startMs: start,
      endMs: end,
      lang,
      uid: `${trip.slug}-${trip.date}@turuj.sk`,
      stampMs: Date.now(),
    });
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
  const testing = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("eve-test") === "1";

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
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--card-bg)] transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
            </span>
            <span>{t("Pripomenúť večer pred výletom")}</span>
          </button>
          {on && <p className="text-xs text-[var(--muted)]">{t("Napíšeme vám o 19:00 deň vopred: počasie a kedy vyraziť.")}</p>}
          {state === "denied" && <p className="text-xs text-[var(--warn)]">{t("Upozornenia sú v prehliadači zakázané. Povoľte ich v nastaveniach stránky alebo použite kalendár.")}</p>}
          {state === "failed" && <p className="text-xs text-[var(--warn)]">{t("Pripomienku sa teraz nepodarilo nastaviť. Skúste to znova alebo použite kalendár.")}</p>}
          {testing && on && (
            <button type="button" onClick={sendTest} className="self-start text-xs underline">
              {t("Poslať skúšobnú pripomienku teraz")}
            </button>
          )}
          {test && <p className="text-xs text-[var(--muted)]">{test}</p>}
        </div>
      )}
      <button type="button" onClick={download} className={`${secondary} self-start`}>
        {t("Pridať do kalendára")}
      </button>
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
