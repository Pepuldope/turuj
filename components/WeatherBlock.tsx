"use client";

import { UiIcon } from "@/components/UiIcon";
import { WeatherTimeline } from "@/components/WeatherTimeline";
import { useState } from "react";
import type { ReactNode } from "react";
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import type { DayPlan } from "@/lib/dayPlan";
import { formatTime } from "@/lib/format";
import { useCachedJson } from "@/lib/useDriveRoute";
import { addDaysIso, isoDate, longDay } from "@/lib/days";
import { activeClosures } from "@/lib/closures";
import { getSunTimes } from "@/lib/sun";
import { hourStrip, worstWalkKind } from "@/lib/hourStrip";
import { clock } from "@/lib/zoned";
import type { SkyKind } from "@/lib/weather";
import { FORECAST_DAYS, betterDay, betterTime, skyKind, summarize, tripWeatherReport, weatherNotes, weatherWords } from "@/lib/weather";
import type { BetterDay, BetterTime, TripWeatherReport, WeatherForecast } from "@/lib/weather";
import { badSkySvg, hourSkySvg } from "@/lib/weatherIcons";
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

  // The hours of the day's light (wider where the plan reaches outside it), one cell each.
  const homeAt = plan.segments[plan.segments.length - 1].end;
  const cells = hourStrip(
    weather.below,
    { from: new Date(Math.min(plan.sunrise.getTime(), leave.getTime() - 3600000)), to: new Date(Math.max(plan.sunset.getTime() + 3600000, homeAt.getTime() + 3600000)) },
    leave,
    plan.hikeStart,
    plan.hikeEnd,
    homeAt
  );
  const timeline = !!onPickTime && cells.some((c) => c.kind !== null);
  const warnings = [...(r.wet && !stormy ? [wetText(r.wet, lang)] : []), ...notes.map((n) => n.text)];
  const wetKind = r.wet && !stormy ? (r.wet.snow ? "snow" : "rain") : "warn";

  return (
    <section aria-label={t("Počasie")} className="flex flex-col gap-2 text-sm">
      {timeline ? (
        <>
          <WalkSummary r={r} kind={worstWalkKind(cells)} wholeDay={wholeDay} />
          <WeatherTimeline cells={cells} hikeStart={plan.hikeStart} hikeEnd={plan.hikeEnd} sunrise={plan.sunrise} sunset={plan.sunset} lead={lead} onPickTime={onPickTime!} />
        </>
      ) : (
        <p>
          <span className="font-semibold">{t(wholeDay ? "Počasie počas výletu:" : "Počasie počas túry:")}</span> {range}
          {r.topMin !== null && goal ? t(", {goal} až {t} °C", { goal: goal.name, t: r.topMin }) : ""}
          {/* Rain, snow and storms get their own warning lines below. */}
          {r.wet ? "." : r.worstWhen ? t(", najhoršie {what} {when}.", { what: r.worst, when: r.worstWhen }) : `, ${r.worst}.`}
        </p>
      )}
      {/* All warnings in one box with a sign (Peter: plain coloured text was easy to overlook); red when any is strong. */}
      {warnings.length > 0 && <Warning kind={stormy ? "storm" : wetKind} lines={warnings} />}
      {sooner && <BetterTimeTip better={sooner} leave={leave} onPickTime={onPickTime!} />}
      {better && <BetterDayTip better={better} hikeStart={plan.hikeStart} onPickDay={onPickDay!} />}
    </section>
  );
}

/** "Počas túry 2 °C" and under it the worst weather and when, with the glyph of that weather beside it. */
function WalkSummary({ r, kind, wholeDay }: { r: TripWeatherReport; kind: SkyKind | null; wholeDay: boolean }) {
  const t = useT();
  const lang = useLang();
  const minus = (n: number) => String(n).replace("-", "\u2212");
  const range = (r.tempMin === r.tempMax ? `${minus(r.tempMin)} °C` : tr(lang, "{a} až {b} °C", { a: minus(r.tempMin), b: minus(r.tempMax) })).replaceAll(" °C", "\u00a0°C");
  const worst = r.wet ? `${r.worst} ${r.wet.when}` : r.worstWhen ? `${r.worst} ${r.worstWhen}` : r.worst;
  return (
    <div className="flex items-center gap-3">
      {kind && <SkyGlyph kind={kind} size={38} />}
      <div className="flex min-w-0 flex-col">
        <p className="text-base font-bold">
          <span className="whitespace-nowrap">
            {t(wholeDay ? "Počas výletu" : "Počas túry")} {range}
            {r.topMin !== null ? "," : ""}
          </span>
          {r.topMin !== null && " "}
          {r.topMin !== null && <span className="whitespace-nowrap">{t("na vrchole až {t} °C", { t: minus(r.topMin).replace(" ", "\u00a0") })}</span>}
        </p>
        <p className="text-sm text-[var(--muted)]">{worst}</p>
      </div>
    </div>
  );
}

const BAD_KIND: Partial<Record<SkyKind, Parameters<typeof badSkySvg>[0]>> = {
  lightrain: "rain",
  rain: "rain",
  heavyrain: "rain",
  sleet: "sleet",
  lightsnow: "snow",
  snow: "snow",
  heavysnow: "snow",
  fog: "fog",
  thunder: "thunder",
};

/** A sky as a glyph: wet, foggy and stormy skies coloured, sun in the sun yellow, cloud grey. */
function SkyGlyph({ kind, size }: { kind: SkyKind; size: number }) {
  const bad = BAD_KIND[kind];
  const color = kind === "clear" || kind === "fair" || kind === "partly" ? "var(--sun)" : "var(--muted)";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="shrink-0"
      style={{ color }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: bad ? badSkySvg(bad, false) : hourSkySvg(kind) }}
    />
  );
}

/** "Môže pršať 8:00–10:00 (mierne, do 0,8 mm/h). Vezmite si nepremokavú bundu." Also the warnings recap's line. */
export function wetText(wet: NonNullable<TripWeatherReport["wet"]>, lang: Lang): string {
  const how = wet.mmPerHour >= 0.1 ? tr(lang, " ({how}, do {mm} mm/h)", { how: tr(lang, wet.mmPerHour < 0.5 ? "slabo" : wet.mmPerHour < 2 ? "mierne" : "výdatne"), mm: decimal(lang, wet.mmPerHour) }) : "";
  return `${tr(lang, wet.snow ? "Môže snežiť" : wet.sleet ? "Môže pršať so snehom" : "Môže pršať")} ${wet.when}${how}. ${tr(lang, "Vezmite si nepremokavú bundu.")}`;
}

const SIGN: Record<"rain" | "snow" | "storm" | "warn", string> = {
  rain: badSkySvg("rain", false),
  snow: badSkySvg("snow", false),
  storm: badSkySvg("thunder", false),
  warn: '<path d="M12 3 22 20H2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9.5v4.5M12 16.8v.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};

/** The weather warnings in one coloured box with a thick edge and its sign; storms in red, the rest amber. One line each. */
function Warning({ kind, lines }: { kind: keyof typeof SIGN; lines: string[] }) {
  const red = kind === "storm";
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 font-semibold ${
        red ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]" : "border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)]"
      }`}
    >
      {/* Constant markup (lib/weatherIcons.ts and the triangle above). */}
      <svg viewBox="0 0 24 24" className="mt-px h-6 w-6 shrink-0" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SIGN[kind] }} />
      <div className="flex flex-col gap-1.5">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}

/** A tip as a tappable card: the sky of that day or time, what it is, the weather, and "Prepnúť" on the right. */
function TipCard({ kind, title, text, onPick }: { kind: SkyKind | null; title: ReactNode; text: ReactNode; onPick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3 py-2.5 text-left hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {kind && <SkyGlyph kind={kind} size={28} />}
      {/* "Prepnúť" sits on the title's line, so the weather line gets the full width (it wrapped to three lines at 360 px). */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 font-bold">{title}</span>
          <span className="shrink-0 font-bold whitespace-nowrap text-[var(--accent)]">{t("Prepnúť")} &rsaquo;</span>
        </span>
        <span className="text-[var(--muted)]">{text}</span>
      </span>
    </button>
  );
}

/** "Sobota 17. 10." / "polojasno · −1 až 4 °C · bez zrážok": a card that moves the plan to that day. */
function BetterDayTip({ better, hikeStart, onPickDay }: { better: BetterDay; hikeStart: Date; onPickDay: (iso: string) => void }) {
  const t = useT();
  const lang = useLang();
  const iso = addDaysIso(isoDate(hikeStart), better.offset);
  const day = longDay(iso, lang);
  return (
    <TipCard
      kind={skyKind(better.summary.symbol)}
      title={`${day.charAt(0).toUpperCase()}${day.slice(1)}`}
      text={tipText(better.summary, lang, t("bez zrážok."))}
      onPick={() => onPickDay(iso)}
    />
  );
}

/** "polojasno · −1 až 4 °C · bez zrážok": each part stays whole when the line wraps. */
function tipText(s: BetterDay["summary"], lang: Lang, dry: string): ReactNode {
  const parts = [weatherWords(s.symbol, lang), temps(s, lang).replace(/(^|\s)-(?=\d)/g, "$1\u2212").replace(" °C", "\u00a0°C"), dry.replace(/\.$/, "")];
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && " \u00b7 "}
      <span className="whitespace-nowrap">{p}</span>
    </span>
  ));
}

/** "Suchšie pri odchode o 11:30": a card that moves the departure there. */
function BetterTimeTip({ better, leave, onPickTime }: { better: BetterTime; leave: Date; onPickTime: (time: string) => void }) {
  const at = new Date(leave.getTime() + better.shiftMin * 60000);
  const t = useT();
  const lang = useLang();
  return (
    <TipCard
      kind={skyKind(better.summary.symbol)}
      title={
        <>
          {t("Suchšie pri odchode o")} <span className="font-data">{formatTime(at)}</span>
        </>
      }
      text={tipText(better.summary, lang, t("bez zrážok."))}
      onPick={() => onPickTime(clock(at))}
    />
  );
}
