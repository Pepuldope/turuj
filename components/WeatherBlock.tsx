"use client";

import { UiIcon } from "@/components/UiIcon";
import { useState } from "react";
import type { ReactNode } from "react";
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import type { DayPlan } from "@/lib/dayPlan";
import { formatTime } from "@/lib/format";
import { useCachedJson } from "@/lib/useDriveRoute";
import { addDaysIso, dayInSentence, isoDate } from "@/lib/days";
import { activeClosures } from "@/lib/closures";
import { getSunTimes } from "@/lib/sun";
import { clock } from "@/lib/zoned";
import { FORECAST_DAYS, betterDay, betterTime, summarize, tripWeatherReport, weatherNotes, weatherWords } from "@/lib/weather";
import type { BetterDay, BetterTime, TripWeatherReport, WeatherForecast } from "@/lib/weather";
import { badSkySvg } from "@/lib/weatherIcons";
import type { Closure, LatLng } from "@/lib/types";
import { useLang, useT } from "@/lib/i18n";
import { decimal, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

type Goal = (LatLng & { ele: number | null; name: string }) | null;

const DAY = 86400000;

function url(p: LatLng, alt?: number | null): string {
  return `/api/weather?lat=${p.lat.toFixed(4)}&lon=${p.lon.toFixed(4)}${alt ? `&alt=${Math.round(alt)}` : ""}`;
}

function temps(s: { tempMin: number; tempMax: number }, lang: Lang): string {
  return s.tempMin === s.tempMax ? `${s.tempMin} °C` : tr(lang, "{a} až {b} °C", { a: s.tempMin, b: s.tempMax });
}

export interface TripWeather {
  /** At the trail start (asked for at its height when known); null until loaded or out of range. */
  below: WeatherForecast | null;
  /** Up at the goal, for its height. */
  above: WeatherForecast | null;
  loading: boolean;
  /** The trail start's forecast whatever day is picked: the day strip marks the bad days in it even when a day past the forecast is picked. */
  strip: WeatherForecast | null;
}

/** The forecast for the day of the walk, at the start and up at the goal; nothing beyond the forecast range. */
export function useTripWeather(plan: DayPlan | null, start: LatLng | null, goal: Goal, startEle: number | null): TripWeather {
  const [now] = useState(() => Date.now());
  const inRange = !!plan && !!start && plan.hikeStart.getTime() - now < FORECAST_DAYS * DAY && plan.hikeEnd.getTime() > now;
  // One request either way: the same URL is shared and cached.
  const below = useCachedJson<WeatherForecast>(start ? url(start, startEle) : null);
  const above = useCachedJson<WeatherForecast>(inRange && goal?.ele ? url(goal, goal.ele) : null);
  return { below: inRange ? below.data : null, above: above.data, loading: inRange && below.status === "loading", strip: below.data };
}

/**
 * One line on the weather during the walk and short warnings under the sun
 * dial (which draws the weather itself). Severe weather gets a red line,
 * wind and frost an amber one, like the sunset notes.
 */
export function WeatherNotes({ plan, weather, goal }: { plan: DayPlan; weather: TripWeather; goal: Goal }) {
  const t = useT();
  const lang = useLang();
  if (weather.loading) return <p className="text-xs text-[var(--muted)]">{t("Načítavame predpoveď počasia…")}</p>;
  if (!weather.below) return null;
  const atStart = summarize(weather.below, plan.hikeStart, plan.hikeEnd);
  if (!atStart) return null;
  const atGoal = weather.above ? summarize(weather.above, plan.hikeStart, plan.hikeEnd) : null;
  const notes = weatherNotes(weather.below, weather.above, plan.hikeStart, plan.hikeEnd, lang);

  return (
    <section aria-label={t("Počasie počas túry")} className="flex flex-col gap-1.5 text-sm">
      <p className="text-[var(--muted)]">
        {t("Počas túry")} {weatherWords(atStart.symbol, lang)}, {temps(atStart, lang)}
        {atGoal && goal && atGoal.tempMin < atStart.tempMin - 1 ? `, ${goal.name} ${temps(atGoal, lang)}` : ""}
        {atStart.rainMm >= 0.2 ? t(", zrážky {mm} mm", { mm: decimal(lang, atStart.rainMm) }) : ""}.
      </p>
      {notes.map((n) =>
        n.strong ? (
          <p key={n.text} className="flex items-start gap-1.5 rounded-xl bg-[var(--danger-bg)] px-3 py-2 font-semibold text-[var(--danger)]">
            <UiIcon name="warn" size={16} className="mt-0.5" />
            <span>{n.text}</span>
          </p>
        ) : (
          <p key={n.text} className="flex items-start gap-1.5 font-semibold text-[var(--warn)]">
            <UiIcon name="warn" size={16} className="mt-0.5" />
            <span>{n.text}</span>
          </p>
        )
      )}
    </section>
  );
}


/**
 * Everything the forecast says about the trip, under the day: the whole
 * temperature range, the worst weather and when, a note for any rain at all
 * (even one light hour), and the storm, wind and frost warnings. By bus the
 * window is the whole day out, since waiting at a stop is outdoors too.
 */
export function WeatherReport({
  plan,
  weather,
  goal,
  wholeDay,
  sunAt,
  closures = [],
  onPickDay,
  onPickTime,
}: {
  plan: DayPlan;
  weather: TripWeather;
  goal: Goal;
  wholeDay: boolean;
  /** Where the plan's sun times are computed: a drier day must fit that day's daylight too. */
  sunAt: LatLng | null;
  /** The trail's closure rules: a drier day the trail is closed is no better. */
  closures?: Closure[];
  /** Moves the trip to another day (YYYY-MM-DD), for the drier-day suggestion. */
  onPickDay?: (iso: string) => void;
  /** Moves the departure (HH:MM) on the same day, for the drier-time suggestion. */
  onPickTime?: (time: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  if (weather.loading) return <p className="text-xs text-[var(--muted)]">{t("Načítavame predpoveď počasia…")}</p>;
  // The forecast loaded but this day is past its range: one quiet line instead of the strip.
  if (!weather.below) return weather.strip ? <p className="text-sm text-[var(--muted)]">{t("Predpoveď na tento deň ešte nie je.")}</p> : null;
  const from = wholeDay ? plan.segments[0].start : plan.hikeStart;
  const to = wholeDay ? plan.segments[plan.segments.length - 1].end : plan.hikeEnd;
  const r = tripWeatherReport(weather.below, weather.above, from, to, { from: plan.hikeStart, to: plan.hikeEnd }, lang);
  if (!r) return null;
  const notes = weatherNotes(weather.below, weather.above, plan.hikeStart, plan.hikeEnd, lang);
  const stormy = notes.some((n) => n.strong);
  const range = temps(r, lang);
  // A wet or stormy walk always gets a next step: the nearest dry day in the forecast, same start time.
  // First a drier time the same day (Peter: moving a few hours beats moving the day), then a drier day; both when both work.
  const now = new Date();
  const leave = plan.segments[0].start;
  const lead = plan.hikeStart.getTime() - leave.getTime();
  // Another day keeps the clock time, so it must be checked again: shorter light in autumn (a whole
  // hour across the clock change), a closure starting that day, a departure already gone.
  const fits = (a: Date, b: Date) => {
    const iso = isoDate(a);
    if (activeClosures(closures, iso).length > 0) return false;
    if (!sunAt) return true;
    const [y, m, d] = iso.split("-").map(Number);
    const sun = getSunTimes(new Date(Date.UTC(y, m - 1, d)), sunAt.lat, sunAt.lon);
    return !!sun && b.getTime() <= sun.sunset.getTime() - SAFE_MARGIN_MIN * 60000;
  };
  const better = onPickDay ? betterDay(weather.below, weather.above, plan.hikeStart, plan.hikeEnd, now, { leadMin: lead / 60000, fits }) : null;
  const sooner = onPickTime
    ? betterTime(weather.below, weather.above, plan.hikeStart, plan.hikeEnd, {
        earliest: new Date(Math.max(plan.sunrise.getTime(), now.getTime() + lead)),
        latest: new Date(plan.sunset.getTime() - SAFE_MARGIN_MIN * 60000),
      })
    : null;

  return (
    <section aria-label={t("Počasie")} className="flex flex-col gap-1.5 text-sm">
      {/* The hour strip (HourStrip) is off until the step 1 weather redesign, option A (Peter, 2026-11-12). */}
      <p>
        <span className="font-semibold">{t(wholeDay ? "Počasie počas výletu:" : "Počasie počas túry:")}</span> {range}
        {r.topMin !== null && goal ? t(", {goal} až {t} °C", { goal: goal.name, t: r.topMin }) : ""}
        {/* Rain, snow and storms get their own warning lines below. */}
        {r.wet ? "." : r.worstWhen ? t(", najhoršie {what} {when}.", { what: r.worst, when: r.worstWhen }) : `, ${r.worst}.`}
      </p>
      {/* Warnings in a box with a sign (Peter: plain coloured text was easy to overlook). */}
      {r.wet && !stormy && (
        <Warning kind={r.wet.snow ? "snow" : "rain"}>
          {wetText(r.wet, lang)}
        </Warning>
      )}
      {notes.map((n) => (
        <Warning key={n.text} kind={n.strong ? "storm" : "warn"}>
          {n.text}
        </Warning>
      ))}
      {(sooner || better) && (
        <div className="flex flex-col gap-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2.5">
          {sooner && <BetterTimeTip better={sooner} leave={leave} onPickTime={onPickTime!} />}
          {better && <BetterDayTip better={better} hikeStart={plan.hikeStart} onPickDay={onPickDay!} alsoTime={!!sooner} />}
        </div>
      )}
    </section>
  );
}

/** "Môže pršať 8:00–10:00 (mierne, do 0,8 mm/h). Vezmite si nepremokavú bundu." Also the warnings recap's line. */
export function wetText(wet: NonNullable<TripWeatherReport["wet"]>, lang: Lang): string {
  const how = wet.mmPerHour >= 0.1 ? tr(lang, " ({how}, do {mm} mm/h)", { how: tr(lang, wet.mmPerHour < 0.5 ? "slabo" : wet.mmPerHour < 2 ? "mierne" : "výdatne"), mm: decimal(lang, wet.mmPerHour) }) : "";
  return `${tr(lang, wet.snow ? "Môže snežiť" : "Môže pršať")} ${wet.when}${how}. ${tr(lang, "Vezmite si nepremokavú bundu.")}`;
}

const SIGN: Record<"rain" | "snow" | "storm" | "warn", string> = {
  rain: badSkySvg("rain", false),
  snow: badSkySvg("snow", false),
  storm: badSkySvg("thunder", false),
  warn: '<path d="M12 3 22 20H2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9.5v4.5M12 16.8v.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};

/** A weather warning: a coloured box with a thick edge and its sign; storms in red, the rest amber. */
function Warning({ kind, children }: { kind: keyof typeof SIGN; children: ReactNode }) {
  const red = kind === "storm";
  return (
    <p
      className={`flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 font-semibold ${
        red ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]" : "border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)]"
      }`}
    >
      {/* Constant markup (lib/weatherIcons.ts and the triangle above). */}
      <svg viewBox="0 0 24 24" className="mt-px h-6 w-6 shrink-0" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SIGN[kind] }} />
      <span>{children}</span>
    </p>
  );
}

/** "Lepšie vyzerá v nedeľu: polojasno, 7 až 11 °C, bez zrážok." and a button that moves the plan there. */
function BetterDayTip({ better, hikeStart, onPickDay, alsoTime }: { better: BetterDay; hikeStart: Date; onPickDay: (iso: string) => void; alsoTime: boolean }) {
  const t = useT();
  const lang = useLang();
  const iso = addDaysIso(isoDate(hikeStart), better.offset);
  const when = dayInSentence(iso, new Date(), lang);
  const s = better.summary;
  return (
    <div className="flex flex-col items-start gap-2">
      <p>
        <span className="font-semibold">{alsoTime ? t("Alebo iný deň, {when}:", { when }) : t("Lepšie vyzerá {when}:", { when })}</span> {weatherWords(s.symbol, lang)}, {temps(s, lang)}, {t("bez zrážok.")}
      </p>
      <button
        type="button"
        onClick={() => onPickDay(iso)}
        className={TIP_BUTTON}
      >
        {/* "v nedeľu 1. 11." -> "Prepnúť na nedeľu" */}
        {t("Prepnúť na {day}", { day: when.replace(/^(vo?|on) /, "").replace(/ \d.*$/, "") })}
      </button>
    </div>
  );
}

const TIP_BUTTON =
  "rounded-[10px] bg-[var(--accent)] px-3 py-2 text-sm font-bold text-[var(--accent-contrast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/** "Suchšie pri odchode o 11:30: polojasno, 7 až 11 °C, bez zrážok." and a button that moves the departure there. */
function BetterTimeTip({ better, leave, onPickTime }: { better: BetterTime; leave: Date; onPickTime: (time: string) => void }) {
  const at = new Date(leave.getTime() + better.shiftMin * 60000);
  // HH:MM for the time box, Slovak time.
  const time = clock(at);
  const s = better.summary;
  const t = useT();
  const lang = useLang();
  return (
    <div className="flex flex-col items-start gap-2">
      <p>
        <span className="font-semibold">
          {t("Suchšie pri odchode o")} <span className="font-data">{formatTime(at)}</span>:
        </span>{" "}
        {weatherWords(s.symbol, lang)}, {temps(s, lang)}, {t("bez zrážok.")}
      </p>
      <button type="button" onClick={() => onPickTime(time)} className={TIP_BUTTON}>
        {t("Vyraziť o")} <span className="font-data">{formatTime(at)}</span>
      </button>
    </div>
  );
}
