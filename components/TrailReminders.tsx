"use client";

import { useEffect, useState } from "react";
import { LangLink, useLang, useT } from "@/lib/i18n";
import { SUNSET_LEAD_MIN } from "@/lib/pushPlan";
import type { ReminderKind } from "@/lib/pushPlan";
import { clockShort, wallClock } from "@/lib/zoned";

// The switch for the calm walk reminders (lib/pushPlan.ts) in the trail screen. Off until the
// group turns it on: the browser's permission prompt only ever follows that tap.

/** Which reminders are planned for which trip today, on this device. */
const KEY = "turuj-reminders";

interface Planned {
  slug: string;
  day: string;
  turn: number | null;
  sunset: number | null;
}

const today = () => {
  const w = wallClock(Date.now());
  return `${w.y}-${w.mo}-${w.d}`;
};

function readPlanned(slug: string): Planned | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Planned | null;
    return v && v.slug === slug && v.day === today() ? v : null;
  } catch {
    return null;
  }
}

function writePlanned(v: Planned | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the switch shows off again next time, the server keeps the plan.
  }
}

export type Support = "ok" | "iphone-browser" | "no";

export function support(): Support {
  if (typeof window === "undefined") return "no";
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (iOS && !installed) return "iphone-browser";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "ok" : "no";
}

export async function currentSub(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribe(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) return old;
  const { key } = (await (await fetch("/api/push")).json()) as { key: string };
  const raw = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4)), (c) => c.charCodeAt(0));
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
}

export async function post(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

/** "Ukončiť": the trip's reminders are dropped (nothing to do if none were planned). */
export async function endReminders(slug: string, kind?: ReminderKind) {
  const planned = readPlanned(slug);
  if (!planned) return;
  writePlanned(kind ? { ...planned, [kind]: null } : null);
  try {
    const sub = await currentSub();
    if (sub) await post({ action: "cancel", sub: sub.toJSON(), slug, ...(kind ? { kind } : {}) });
  } catch {
    // Offline: the reminder may still come; it says "if you're already on the way back, all good".
  }
}

type State = "off" | "busy" | "on" | "denied" | "failed";

export function TrailReminders({
  slug,
  name,
  turnAt,
  sunset,
  pastGoal,
  now: at,
}: {
  slug: string;
  name: string;
  /** Be at the goal by then to be back before dark (null: on the way back, or a loop). */
  turnAt: Date | null;
  sunset: Date | null;
  pastGoal: boolean;
  /** The time of the last GPS fix. */
  now: Date;
}) {
  const t = useT();
  const lang = useLang();
  const [planned, setPlanned] = useState<Planned | null>(null);
  const [state, setState] = useState<State>("off");
  const [can, setCan] = useState<Support>("no");

  useEffect(() => {
    const p = readPlanned(slug);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCan(support());
    setPlanned(p);
    if (p) setState("on");
  }, [slug]);

  // At the goal: the "time to turn back" reminder has nothing left to say.
  useEffect(() => {
    if (!pastGoal || !planned?.turn) return;
    endReminders(slug, "turn");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlanned({ ...planned, turn: null });
  }, [pastGoal, planned, slug]);

  const now = at.getTime();
  const turn = turnAt && !pastGoal && turnAt.getTime() > now + 5 * 60_000 ? turnAt.getTime() : null;
  const sunsetAt = sunset ? sunset.getTime() - SUNSET_LEAD_MIN * 60_000 : null;
  const sun = sunsetAt && sunsetAt > now ? sunsetAt : null;

  async function turnOn() {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const sub = await subscribe();
      const items = [...(turn ? [{ kind: "turn", at: turn }] : []), ...(sun ? [{ kind: "sunset", at: sun }] : [])];
      const ok = await post({ action: "plan", sub: sub.toJSON(), slug, name, lang, items });
      if (!ok) return setState("failed");
      const p = { slug, day: today(), turn, sunset: sun };
      writePlanned(p);
      setPlanned(p);
      setState("on");
    } catch {
      setState("failed");
    }
  }

  async function turnOff() {
    await endReminders(slug);
    setPlanned(null);
    setState("off");
  }

  async function test() {
    const sub = await currentSub().catch(() => null);
    if (sub) await post({ action: "test", sub: sub.toJSON(), slug, lang });
  }

  const row = "flex flex-col gap-1 border-t border-[var(--border)] pt-3";
  if (can === "iphone-browser")
    return (
      <div className={row}>
        <strong>{t("Pripomienky počas výletu")}</strong>
        <p className="text-[var(--muted)]">
          {t("Na iPhone fungujú len v appke z plochy.")}{" "}
          <LangLink href="/aplikacia" className="font-semibold text-[var(--accent)] underline">
            {t("Získať appku")}
          </LangLink>
        </p>
      </div>
    );
  if (can === "no") return null;

  if (state === "on" && planned) {
    const parts = [
      ...(planned.turn ? [t("o {at} kedy sa otočiť", { at: clockShort(planned.turn) })] : []),
      ...(planned.sunset ? [t("o {at} pred západom slnka", { at: clockShort(planned.sunset) })] : []),
    ];
    return (
      <div className={row}>
        <strong>{t("Pripomienky sú zapnuté")}</strong>
        <p>{parts.length ? t("Napíšeme vám {what}.", { what: parts.join(t(" a ")) }) : t("Dnes už nič neostáva, nič vám nepošleme.")}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" onClick={turnOff} className="font-semibold text-[var(--accent)] underline">
            {t("Vypnúť")}
          </button>
          <button type="button" onClick={test} className="text-[var(--muted)] underline">
            {t("Poslať skúšobnú")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={row}>
      <div className="flex items-center justify-between gap-3">
        <strong>{t("Pripomienky počas výletu")}</strong>
        <button
          type="button"
          onClick={turnOn}
          disabled={state === "busy" || (!turn && !sun)}
          className="shrink-0 rounded-full border border-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent)] disabled:opacity-50"
        >
          {t("Zapnúť")}
        </button>
      </div>
      <p className="text-[var(--muted)]">
        {state === "denied"
          ? t("Upozornenia sú pre Túruj vypnuté v nastaveniach telefónu.")
          : state === "failed"
            ? t("Pripomienky sa nepodarilo zapnúť. Skúste to znova so signálom.")
            : !turn && !sun
              ? t("Dnes už nič neostáva, nič vám nepošleme.")
              : t("Najviac dve správy: kedy sa otočiť, aby ste boli späť za svetla, a pred západom slnka. Prídu aj so zamknutým mobilom.")}
      </p>
    </div>
  );
}
