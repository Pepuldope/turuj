"use client";

import { useEffect, useRef, useState } from "react";
import { addDaysIso, shortDate, weekdayName } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import { sendReview } from "@/lib/sendReview";
import { useTripSettings } from "@/lib/tripSettings";
import { routeTrip } from "@/lib/visits";
import { useLeave } from "@/lib/usePresence";
import { useScrollLock } from "@/lib/useScrollLock";
import { detailAsked, parseWhen, roughWhen, SEASONS, seasonWord, whenLabel, yearChoices } from "@/lib/visitWhen";
import type { Season } from "@/lib/visitWhen";
import { DayCalendar } from "@/components/DayCalendar";
import { chip, NO_ANSWERS, ReviewFields } from "@/components/ReviewFields";
import { RoutePick, routeNameOf, UNKNOWN_ROUTE } from "@/components/RoutePick";
import type { RoutePickData } from "@/components/RoutePick";
import { UiIcon } from "@/components/UiIcon";
import { VisitMark } from "@/components/VisitMark";

const OLDEST_YEAR = 1980;

const box = (on: boolean) => `rounded-xl border px-3.5 py-3 text-left ${on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"}`;
const focus = "focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const link = `text-sm font-bold text-[var(--accent)] underline underline-offset-[3px] ${focus}`;
const pill = `rounded-full px-4 py-2.5 text-sm font-semibold min-h-10 ${focus}`;

/**
 * "Kedy ste tu boli?" (Peter, 25 Nov 2026): the day of a visit and, when there is none yet, a quick review.
 * The day is never filled in for the visitor: by hand nothing is chosen until they pick a day, a rough time or
 * say they do not know. From a saved plan the day is the plan's and is shown, with a way to change it.
 *
 * At a place with several routes (`pick`) the same window then asks the route, on a small drawn map and in a
 * list (Peter: one window, the day first). The route is not chosen for the visitor either; "I don't know which"
 * is an answer. A visit from a plan has the plan's route and is not asked.
 */
export function VisitSheet({
  name,
  slug,
  plan,
  edit,
  pick,
  reviewed,
  onSave,
  onClose,
}: {
  name: string;
  slug: string;
  plan?: { date: string };
  edit?: { date: string; route: string; onRemove: () => void };
  /** The routes to choose from: given for a place with several routes, by hand or when fixing a visit. */
  pick?: RoutePickData;
  reviewed: boolean;
  /** `route` is what the visitor picked ("" = does not know); undefined when the window did not ask. */
  onSave: (date: string, route?: string) => void;
  onClose: () => void;
}) {
  const tx = useT();
  const lang = useLang();
  const { today } = useTripSettings();
  const { state: motion, leave } = useLeave();
  const start = edit ? edit.date : (plan?.date ?? null);
  const startKind = start === null ? null : parseWhen(start).kind;
  const [date, setDate] = useState<string | null>(start);
  const asksRoute = pick !== undefined && plan === undefined;
  const [route, setRoute] = useState<string | null>(edit && asksRoute ? edit.route : null);
  const [rough, setRough] = useState(edit !== undefined && startKind !== "day");
  const [changing, setChanging] = useState(false);
  const [older, setOlder] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [answers, setAnswers] = useState(NO_ANSWERS);
  const [phase, setPhase] = useState<"form" | "sending" | "preview" | "error">("form");
  const [asking, setAsking] = useState(false);
  const saved = useRef(false);
  const close = () => leave(onClose);
  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leave(onClose);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave, onClose]);

  const when = date === null ? null : parseWhen(date);
  const yesterday = today ? addDaysIso(today, -1) : null;
  const dayIso = when?.kind === "day" ? when.iso : null;
  const otherDay = dayIso !== null && dayIso !== today && dayIso !== yesterday;
  const years = today ? yearChoices(today) : [];
  const lastChip = years[years.length - 1] ?? 0;
  const year = when?.kind === "season" || when?.kind === "year" ? when.year : null;
  const season = when?.kind === "season" ? when.season : null;
  const olderMode = older || (year !== null && year < lastChip);
  const showReview = !reviewed && !edit;
  const detail = date !== null && !!today && detailAsked(date, today);

  async function sendOnly() {
    setPhase("sending");
    // The review is of the route walked, when the visitor named one; else of the page's own.
    const r = await sendReview(asksRoute && route ? routeTrip(route) : slug, detail ? answers : { ...answers, fit: null, crowded: null, timing: null });
    if (r === "ok") close();
    else setPhase(r);
  }

  function save() {
    if (date === null || (asksRoute && route === null) || saved.current) return;
    saved.current = true;
    onSave(date, asksRoute && route !== null ? route : undefined);
    if (showReview && answers.stars > 0) void sendOnly();
    else close();
  }

  const dayName = (iso: string) => {
    const w = weekdayName(iso, lang);
    return { w, d: shortDate(iso, lang) };
  };

  function dayButton(label: string, iso: string) {
    const { w, d } = dayName(iso);
    return (
      <button type="button" aria-pressed={dayIso === iso} onClick={() => setDate(iso)} className={`${box(dayIso === iso)} flex min-h-10 flex-1 flex-col ${focus}`}>
        <b className="text-base">{label}</b>
        <span className="whitespace-nowrap text-[13px] text-[var(--muted)]">
          {w} <span className="font-data text-[15px] text-[var(--foreground)]">{d}</span>
        </span>
      </button>
    );
  }

  const shell = (children: React.ReactNode) => (
    <div role="dialog" aria-modal="true" aria-label={tx(asksRoute ? "Vaša návšteva" : "Kedy ste tu boli?")} className="fixed inset-0 z-50 grid place-items-center p-4">
      <div data-state={motion} className="pres pres-backdrop absolute inset-0 touch-none bg-black/45" onClick={phase === "form" ? close : undefined} />
      <div data-state={motion} className="pres pres-pop relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[420px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow-float)]">
        {children}
      </div>
    </div>
  );

  if (phase === "preview" || phase === "error") {
    // The visit is on the device; only the stars did not go. Says what was saved, so the window is worth reading.
    const walked = !asksRoute || !pick || route === null ? null : route === UNKNOWN_ROUTE ? tx("trasu neviete") : routeNameOf(pick, route, lang);
    const savedWhen = date === null ? null : date === "" ? tx("Kedy to bolo, neviete") : whenLabel(date, lang);
    return shell(
      <>
        <div className="flex flex-col items-center gap-2 pt-1 text-center">
          <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-[var(--foreground)] text-[var(--card-bg)]">
            <UiIcon name="check" size={26} />
          </span>
          <h2 className="text-lg font-extrabold">{tx("Návšteva je uložená")}</h2>
          <p className="text-[15px]">
            <b>{name}</b>
            {savedWhen && (
              <>
                {" · "}
                <span className={date === "" ? "" : "font-data whitespace-nowrap text-[17px]"}>{savedWhen}</span>
              </>
            )}
            {walked && <span className="block text-sm text-[var(--muted)]">{walked}</span>}
          </p>
        </div>
        {phase === "preview" ? (
          <p className="rounded-xl bg-[var(--page-sunk)] px-3.5 py-3 text-sm">{tx("Hodnotenie sa neodoslalo: toto je len skúšobná verzia stránky.")}</p>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--danger-bg)] px-3.5 py-3 text-sm text-[var(--danger)]">
            <UiIcon name="warn" size={16} className="mt-0.5" />
            <span>{tx("Hodnotenie sa nepodarilo odoslať.")}</span>
          </p>
        )}
        <div className="flex flex-col gap-2">
          {phase === "error" && (
            <button type="button" onClick={sendOnly} className={`${pill} w-full border border-[var(--border)]`}>
              {tx("Skúsiť znova")}
            </button>
          )}
          <button type="button" onClick={close} className={`${pill} w-full bg-[var(--accent)] font-bold text-[var(--accent-contrast)]`}>
            {tx("Hotovo")}
          </button>
        </div>
      </>,
    );
  }

  const fromPlan = plan !== undefined && !changing && !edit;
  const checkLine = date === "" ? tx("Kedy to bolo, neviete") : date !== null && year !== null ? whenLabel(date, lang) : null;

  return shell(
    <>
      <div>
        <h2 className="text-lg font-extrabold">{tx(asksRoute ? "Vaša návšteva" : "Kedy ste tu boli?")}</h2>
        <p className="text-sm text-[var(--muted)]">{name}</p>
      </div>

      {asksRoute && <b className="-mb-1.5 text-[15px]">{tx("Kedy ste tu boli?")}</b>}

      {rough ? (
        <div className="flex flex-col gap-3">
          <b className="text-[15px]">{tx("Aspoň približne?")}</b>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--muted)]">{tx("Rok")}</span>
            {olderMode ? (
              <select
                aria-label={tx("Rok")}
                value={year !== null && year < lastChip ? year : ""}
                onChange={(e) => e.target.value && setDate(roughWhen(Number(e.target.value), season))}
                className={`min-h-10 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 text-[14px] font-semibold ${focus}`}
              >
                <option value="" disabled>
                  {tx("Rok")}
                </option>
                {Array.from({ length: Math.max(0, lastChip - 1 - OLDEST_YEAR + 1) }, (_, i) => lastChip - 1 - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {years.map((y) => (
                  <button key={y} type="button" aria-pressed={year === y} onClick={() => setDate(roughWhen(y, season))} className={`${chip(year === y)} font-data min-h-10`}>
                    {y}
                  </button>
                ))}
                <button type="button" onClick={() => setOlder(true)} className={`${chip(false)} min-h-10`}>
                  {tx("skôr")}
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-[var(--muted)]">
              {tx("Ročné obdobie")} <span className="font-normal">· {tx("ak viete")}</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SEASONS.map((s: Season) => (
                <button
                  key={s}
                  type="button"
                  disabled={year === null}
                  aria-pressed={season === s}
                  onClick={() => year !== null && setDate(roughWhen(year, season === s ? null : s))}
                  className={`${chip(season === s)} min-h-10 disabled:opacity-40`}
                >
                  {seasonWord(s, lang)}
                </button>
              ))}
            </div>
          </div>
          {checkLine && (
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <VisitMark done />
              <span className={date === "" ? "" : "font-data text-[17px]"}>{checkLine}</span>
            </p>
          )}
          <button type="button" onClick={() => setDate("")} className={`${link} self-start text-left`}>
            {tx("Vôbec neviem, kedy to bolo")}
          </button>
          <button
            type="button"
            onClick={() => {
              setRough(false);
              setOlder(false);
              setDate(null);
            }}
            className={`${link} self-start text-left`}
          >
            {tx("Viem presný deň")}
          </button>
          <p className="text-[13px] text-[var(--muted)]">{tx("Pri starších návštevách sa pýtame len na hviezdičky.")}</p>
        </div>
      ) : fromPlan && dayIso ? (
        <div className="flex flex-col gap-2">
          <div className={`${box(true)} flex min-h-10 items-center gap-2.5`}>
            <UiIcon name="cal" size={20} className="text-[var(--accent)]" />
            <span className="min-w-0 flex-1 whitespace-nowrap">
              {dayName(dayIso).w} <span className="font-data text-[17px] font-bold">{whenLabel(dayIso, lang)}</span>
            </span>
            <button type="button" onClick={() => setChanging(true)} className={`-my-2 -mr-1 py-2 pl-1 pr-1 ${link}`}>
              {tx("Zmeniť")}
            </button>
          </div>
          <p className="text-[13px] text-[var(--muted)]">{tx("Deň a trasa sú z vášho plánu.")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {today && yesterday && (
            <div className="flex gap-2">
              {dayButton(tx("Dnes"), today)}
              {dayButton(tx("Včera"), yesterday)}
            </div>
          )}
          <button
            type="button"
            aria-expanded={calendar}
            onClick={() => setCalendar((v) => !v)}
            className={`${box(otherDay)} flex min-h-10 items-center gap-2.5 ${focus}`}
          >
            <UiIcon name="cal" size={20} className="text-[var(--accent)]" />
            {otherDay && dayIso ? (
              <span className="min-w-0 flex-1 whitespace-nowrap">
                {dayName(dayIso).w} <span className="font-data text-[17px] font-bold">{whenLabel(dayIso, lang)}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-[14.5px] font-semibold">{tx("Iný deň")}</span>
            )}
            <UiIcon name="down" size={18} className={`text-[var(--muted)] ${calendar ? "rotate-180" : ""}`} />
          </button>
          {calendar && today && (
            <DayCalendar
              value={dayIso}
              today={today}
              oldestYear={OLDEST_YEAR}
              onPick={(iso) => {
                setDate(iso);
                setCalendar(false);
              }}
            />
          )}
          <button
            type="button"
            onClick={() => {
              setRough(true);
              if (dayIso) setDate(null);
            }}
            className={`${link} self-start py-2 text-left`}
          >
            {tx("Neviem presný deň")}
          </button>
          {date === null && <p className="text-[13px] text-[var(--muted)]">{tx("Bez dátumu sa nič neuloží.")}</p>}
          {plan && date === plan.date && <p className="text-[13px] text-[var(--muted)]">{tx("Deň a trasa sú z vášho plánu.")}</p>}
        </div>
      )}

      {asksRoute && pick && (
        <>
          <hr className="border-[var(--border)]" />
          <b className="-mb-1.5 text-[15px]">{tx("Ktorou trasou ste išli?")}</b>
          <RoutePick data={pick} value={route} onChange={setRoute} />
        </>
      )}

      {showReview && (
        <>
          <hr className="border-[var(--border)]" />
          <b className="text-[15px]">
            {tx("Aký bol výlet?")} <span className="text-[13px] font-normal text-[var(--muted)]">· {tx("nepovinné")}</span>
          </b>
          <ReviewFields value={answers} onChange={setAnswers} detail={detail} />
        </>
      )}

      {edit && (
        <div className="text-sm">
          {asking ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{tx("Naozaj odstrániť?")}</span>
              <button type="button" onClick={() => { edit.onRemove(); close(); }} className={`py-2 font-bold underline underline-offset-[3px] ${focus}`}>
                {tx("Odstrániť")}
              </button>
              <button type="button" onClick={() => setAsking(false)} className={`py-2 font-bold underline underline-offset-[3px] ${focus}`}>
                {tx("Nechať")}
              </button>
            </p>
          ) : (
            <button type="button" onClick={() => setAsking(true)} className={`py-2 text-[var(--muted)] underline underline-offset-[3px] ${focus}`}>
              {tx("Odstrániť návštevu")}
            </button>
          )}
        </div>
      )}

      {asksRoute && date !== null && route === null && <p className="-mb-1.5 text-[13px] text-[var(--muted)]">{tx("Ešte vyberte trasu.")}</p>}

      <div className="flex justify-between gap-2">
        <button type="button" onClick={close} className={`${pill} border border-[var(--border)]`}>
          {tx("Zrušiť")}
        </button>
        <button
          type="button"
          disabled={date === null || (asksRoute && route === null) || phase === "sending"}
          onClick={save}
          className={`rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--accent-contrast)] disabled:opacity-40 min-h-10 ${focus}`}
        >
          {phase === "sending" ? tx("Odosielam…") : tx("Uložiť")}
        </button>
      </div>
    </>,
  );
}
