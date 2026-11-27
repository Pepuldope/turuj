"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { activeClosures } from "@/lib/closures";
import { shortDate, weekdayInSentence } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import { cancelPlan, movePlan } from "@/lib/movePlan";
import type { AnswerFrom } from "@/lib/movePlan";
import type { SavedTrip } from "@/lib/savedTrips";
import { useSavedTrips } from "@/lib/savedTrips";
import { useTripSettings } from "@/lib/tripSettings";
import { useLeave } from "@/lib/usePresence";
import { useScrollLock } from "@/lib/useScrollLock";
import { DayCalendar } from "@/components/DayCalendar";
import { UiIcon } from "@/components/UiIcon";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const btn = `inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 text-[13.5px] whitespace-nowrap ${focus}`;
const second = `${btn} border border-[var(--border)] bg-[var(--card-bg)] font-semibold hover:border-[var(--accent)]`;

/**
 * A plan whose day has passed, three answers at once (C229, Peter 26 Nov 2026, design S2-C in
 * brand-ux/mockups/2026-11-26-saved-trips/final.html, section 3): "Boli sme tu", "Iný deň", "Zrušiť" in one row
 * ranked by width. Where a label does not fit with its icon (small phones, the longer English labels) the row
 * becomes two in a row with a full-width "Zrušiť plán" below; icons are never dropped and sit centred with their
 * labels. Used on the home strip, the trip page's visit row and the card in Moje výlety.
 */
export function PassedPlanAnswers({ trip, from, here = false, onWent }: { trip: SavedTrip; from: AnswerFrom; here?: boolean; onWent: () => void }) {
  const t = useT();
  const lang = useLang();
  const { remove } = useSavedTrips();
  const [moving, setMoving] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  // The row's width at which the three did not fit: wider than that, they are tried in one row again.
  const failedAt = useRef(Infinity);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const check = () => {
      const w = el.clientWidth;
      if (!narrow) {
        // A label fits when it and its icon keep 4 px of air on each side; touching the edge reads as cramped (320 px phones
        // have about 2 px).
        const need = (b: Element) => Array.from(b.children).reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) + 6 * (b.children.length - 1) + 8;
        const over = Array.from(el.children).some((b) => need(b) > b.clientWidth + 0.5);
        if (over) {
          failedAt.current = w;
          setNarrow(true);
        }
      } else if (w > failedAt.current) setNarrow(false);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [narrow, lang]);

  // The page's own fonts can arrive after the first look and measure differently from the stand-ins: try one row once more.
  useEffect(() => {
    void document.fonts?.ready.then(() => {
      failedAt.current = Infinity;
      setNarrow(false);
    });
  }, []);

  // A pale blue box with a bright blue frame (Peter, 27 Nov 2026, option A, in all three places: under Save on the trip
  // page "its too easy to ignore"; it is an important question).
  return (
    <>
      <div className="flex flex-col gap-2.5 rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-3">
      <p className="px-0.5 text-[15px] leading-snug font-semibold">
        {t(here ? "Boli ste tu" : "Boli ste tam")} {weekdayInSentence(trip.date, lang)}{" "}
        <b className="font-data whitespace-nowrap text-[17px]">{shortDate(trip.date, lang)}</b>?
      </p>
      <div
        ref={row}
        className={`grid gap-2 ${narrow ? "grid-cols-2" : "grid-cols-[minmax(0,44fr)_minmax(0,32fr)_minmax(0,24fr)]"}`}
      >
        <button type="button" onClick={onWent} className={`${btn} bg-[var(--accent)] font-bold text-[var(--accent-contrast)]`}>
          <UiIcon name="check" size={16} />
          <span>{t("Boli sme tu")}</span>
        </button>
        <button type="button" onClick={() => setMoving(true)} className={second}>
          <UiIcon name="cal" size={15} />
          <span>{t("Iný deň")}</span>
        </button>
        <button
          type="button"
          onClick={() => cancelPlan(trip, remove, from)}
          className={narrow ? `${second} col-span-2 min-h-10` : second}
        >
          <UiIcon name="close" size={14} />
          <span>{t(narrow ? "Zrušiť plán" : "Zrušiť")}</span>
        </button>
      </div>
      </div>
      {moving && createPortal(<MoveSheet trip={trip} from={from} onClose={() => setMoving(false)} />, document.body)}
    </>
  );
}

/**
 * "Iný deň": the page's own month calendar, from today on (the browser's date picker is a different thing in every
 * browser). The picked day shows its closure state from the rules saved with the plan, never "open". Moving keeps the
 * time, start and stops, and takes the evening reminder along (lib/movePlan.ts).
 */
function MoveSheet({ trip, from, onClose }: { trip: SavedTrip; from: AnswerFrom; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const { today } = useTripSettings();
  const { patch } = useSavedTrips();
  const { state: motion, leave } = useLeave();
  const [day, setDay] = useState<string | null>(null);
  const close = () => leave(onClose);
  useScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leave(onClose);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave, onClose]);

  if (!today) return null;
  const closed = day !== null && trip.closures ? activeClosures(trip.closures, day).length > 0 : false;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("Na ktorý deň?")} className="fixed inset-0 z-50 grid place-items-center p-4">
      <div data-state={motion} className="pres pres-backdrop absolute inset-0 touch-none bg-black/45" onClick={close} />
      <div data-state={motion} className="pres pres-pop relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[420px] flex-col gap-4 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] bg-[var(--card-bg)] p-5 shadow-[var(--shadow-float)]">
        <div>
          <h2 className="text-lg font-extrabold">{t("Na ktorý deň?")}</h2>
          <p className="text-sm text-[var(--muted)]">
            {trip.name} · {t("odchod")} <span className="font-data text-base text-[var(--foreground)]">{trip.time}</span>
          </p>
        </div>
        <DayCalendar value={day} today={today} ahead onPick={setDay} />
        {day !== null &&
          (closed ? (
            <p className="flex items-start gap-1.5 text-[13.5px] font-semibold text-[var(--danger)]">
              <UiIcon name="warn" size={16} className="mt-0.5 shrink-0" />
              <span>{t("Chodník je v deň výletu ({date}) uzavretý", { date: shortDate(day, lang) })}</span>
            </p>
          ) : (
            <p className="text-[13.5px] text-[var(--muted)]">
              {trip.closures
                ? t("Na {date} bez známej uzávery, stav chodníka neoverený.", { date: shortDate(day, lang) })
                : t("Stav chodníka neoverený")}
            </p>
          ))}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={day === null}
            onClick={() => {
              if (day === null) return;
              movePlan(trip, day, patch, lang, from);
              close();
            }}
            className={`min-h-11 w-full rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] disabled:opacity-40 ${focus}`}
          >
            {day === null ? t("Vyberte deň") : t("Presunúť na {day}", { day: shortDate(day, lang) })}
          </button>
          <button type="button" onClick={close} className={`min-h-10 w-full rounded-full border border-[var(--border)] px-4 text-sm font-semibold ${focus}`}>
            {t("Späť")}
          </button>
        </div>
      </div>
    </div>
  );
}
