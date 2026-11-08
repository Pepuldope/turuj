"use client";

import { useMemo, useState } from "react";
import { BAD_SKY_LABEL, badSkySvg } from "@/lib/weatherIcons";
import type { BadSky } from "@/lib/weather";
import { addDaysIso, dayStrip, isoDate, shortDay } from "@/lib/days";
import { useTripSettings } from "@/lib/tripSettings";
import { UiIcon } from "@/components/UiIcon";
import { useLang, useT } from "@/lib/i18n";
import type { Lang } from "@/lib/lang";

const MONTHS = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "október", or "október – november" when the strip runs into the next month. */
function stripMonths(first: string, last: string, lang: Lang): string {
  const names = lang === "en" ? EN_MONTHS : MONTHS;
  const a = names[Number(first.slice(5, 7)) - 1];
  const b = names[Number(last.slice(5, 7)) - 1];
  return a === b ? a : `${a} – ${b}`;
}

interface Props {
  /** Trip pages always plan a day, so the choice there can't be cleared. */
  variant?: "home" | "trip";
  /** Trip page: the day being planned even when none was picked. */
  activeDate?: string | null;
  /** Trip page: days whose walk gets rain, snow, fog or a storm, drawn under the day in the strip. */
  dayWeather?: Record<string, BadSky>;
}

const segment = "grid grid-cols-3 gap-[3px] rounded-xl bg-[var(--segment-bg)] p-[3px]";
const segBtn = (on: boolean) =>
  `inline-flex items-center justify-center gap-1.5 rounded-[10px] px-2 py-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
    on ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
  }`;

/** The day: Dnes, Zajtra, or Iný deň (two weeks to tap, and the full calendar). */
export function FilterChips({ variant = "home", activeDate, dayWeather }: Props) {
  const { date, today, update } = useTripSettings();
  const t = useT();
  const lang = useLang();
  const [stripOpen, setStripOpen] = useState(false);
  const current = variant === "trip" ? (activeDate ?? date) : date;
  const days = useMemo(() => {
    if (!today) return null;
    const now = new Date();
    return {
      today: isoDate(now),
      tomorrow: addDaysIso(isoDate(now), 1),
      strip: dayStrip(now, 14, lang),
    };
  }, [today, lang]);
  const other = current !== null && days !== null && current !== days.today && current !== days.tomorrow;
  const showStrip = days !== null && stripOpen;

  function pick(iso: string) {
    // On home a second tap un-picks the day: back to every trip.
    setStripOpen(false);
    update({ date: variant === "home" && iso === date ? null : iso });
  }

  // "Iný deň" is picked at once (the day after tomorrow), then the strip lets you move it.
  function openOther() {
    if (!days) return;
    if (!other) {
      const next = days.strip.find((d) => d.iso !== days.today && d.iso !== days.tomorrow);
      if (next) update({ date: next.iso });
      setStripOpen(true);
      return;
    }
    setStripOpen((v) => !v);
  }

  // The date input itself takes the tap (Peter, 2026-10-28: a hidden input opened from a button did
  // nothing on some phones). Chrome on a computer only opens it from the little icon, so ask for the picker too.
  function openCalendar(el: HTMLInputElement) {
    try {
      el.showPicker();
    } catch {
      // Not supported or already open: the tap on the input opens it.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label={t("Deň výletu")} className={segment}>
        <button type="button" aria-pressed={!!days && current === days.today} onClick={() => days && pick(days.today)} className={segBtn(!!days && current === days.today)}>
          {t("Dnes")}
        </button>
        <button type="button" aria-pressed={!!days && current === days.tomorrow} onClick={() => days && pick(days.tomorrow)} className={segBtn(!!days && current === days.tomorrow)}>
          {t("Zajtra")}
        </button>
        <button
          type="button"
          aria-pressed={other}
          aria-expanded={showStrip}
          onClick={openOther}
          className={segBtn(other)}
        >
          {/* On a narrow phone the picked date ("St 14. 10.") needs the icon's room to stay on one line. */}
          <span className={other ? "hidden min-[380px]:inline-flex" : "inline-flex"}>
            <UiIcon name="cal" size={15} />
          </span>
          {other && current ? shortDay(current, lang) : t("Iný deň")}
        </button>
      </div>

      {showStrip && days && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[12.5px] font-bold text-[var(--muted)]">
            <span className="capitalize">{stripMonths(days.strip[0].iso, days.strip[days.strip.length - 1].iso, lang)}</span>
            {/* The date input is invisible (opacity-0), so the label draws its focus ring. */}
            <span className="relative -my-2 rounded-md py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]">
              <span aria-hidden="true" className="inline-flex items-center gap-0.5 font-bold text-[var(--accent)]">
                {t("Celý kalendár")} <UiIcon name="chev" size={13} />
              </span>
              <input
                type="date"
                aria-label={t("Celý kalendár")}
                min={days.today}
                value={current ?? ""}
                onClick={(e) => openCalendar(e.currentTarget)}
                onChange={(e) => e.target.value && update({ date: e.target.value })}
                className="absolute inset-0 h-full w-full min-w-0 cursor-pointer appearance-none opacity-0"
              />
            </span>
          </div>
          <div role="listbox" aria-label={t("Vyberte deň")} className="flex gap-[5px] overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {days.strip.map((d) => {
              const on = current === d.iso;
              return (
                <button
                  key={d.iso}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => update({ date: d.iso })}
                  className={`flex w-[42px] shrink-0 flex-col items-center gap-px rounded-[11px] border py-1.5 ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                      : d.weekend
                        ? "border-transparent bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--card-bg)]"
                  }`}
                >
                  <span className={`text-[11px] font-semibold ${on ? "" : "text-[var(--muted)]"}`}>{d.weekday}</span>
                  <span className="font-data text-[17px] leading-tight font-bold">{d.day}</span>
                  {dayWeather?.[d.iso] && (
                    <svg
                      viewBox="0 0 24 24"
                      width={20}
                      height={20}
                      role="img"
                      aria-label={t(BAD_SKY_LABEL[dayWeather[d.iso]])}
                      // Constant markup from lib/weatherIcons.ts, no user data.
                      dangerouslySetInnerHTML={{ __html: badSkySvg(dayWeather[d.iso], on) }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Idete s deťmi?" with what turning it on does (Peter: the line says what the switch does, not its state).
 * The one "slower" question (Peter, 2026-10-27, A12): it adds time on the trail and keeps the home list
 * to kid-friendly trips. The list says so (`forList`); a trip page only changes the time.
 */
export function KidsRow({ forList = false }: { forList?: boolean }) {
  const { withKids, update } = useTripSettings();
  const t = useT();
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex text-[var(--accent)]">
        <UiIcon name="kid" size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14.5px] font-bold">{t("Idete s deťmi?")}</span>
        <span className="text-[12.5px] text-[var(--muted)]">{forList ? t("Viac času na trase a len trasy vhodné pre deti.") : t("Prispôsobíme čas trasy.")}</span>
      </span>
      <Switch on={withKids} label={t("Idete s deťmi")} onChange={(on) => update({ withKids: on, easier: on })} />
    </div>
  );
}

/** A plain on/off switch, as on phones. */
export function Switch({ on, label, onChange, small = false }: { on: boolean; label: string; onChange: (on: boolean) => void; small?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        small ? "h-[22px] w-9" : "h-7 w-[46px]"
      } ${on ? "bg-[var(--accent)]" : "bg-[#cfd5de]"}`}
    >
      <span
        className={`absolute top-[3px] left-[3px] rounded-full bg-white shadow transition-transform ${small ? "h-4 w-4" : "h-[22px] w-[22px]"} ${
          on ? (small ? "translate-x-[14px]" : "translate-x-[18px]") : ""
        }`}
      />
    </button>
  );
}
