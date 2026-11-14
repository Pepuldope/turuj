"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode, RefObject } from "react";
import { KedyDays } from "@/components/KedyDays";
import { ScrollStrip } from "@/components/ScrollStrip";
import { UiIcon } from "@/components/UiIcon";
import { wetText } from "@/components/WeatherBlock";
import type { TripWeather } from "@/components/WeatherBlock";
import type { DayPlan } from "@/lib/dayPlan";
import { activeClosures } from "@/lib/closures";
import { addDaysIso, dayInSentence, isoDate, longDay, shortDate } from "@/lib/days";
import { formatDuration } from "@/lib/format";
import { hourStrip, snapTime } from "@/lib/hourStrip";
import type { HourCell } from "@/lib/hourStrip";
import { useLang, useT } from "@/lib/i18n";
import type { Lang } from "@/lib/lang";
import {
  SCALE_HOURS,
  SCALE_TO_MIN,
  VISIBLE_HOURS,
  barEnds,
  barSegments,
  darkSpans,
  dayBand,
  dayMinutes,
  dayTiles,
  dryFix,
  hhmmToMin,
  keptAfterPick,
  kedyCards,
  hasLeg,
  latestSetStart,
  startTime,
  minToHhmm,
  rowCells,
  rowRange,
  scalePos,
  summaryParts,
  sunMarks,
} from "@/lib/kedyTimeline";
import type { BarPiece, KedyCandidate, KedyCard, KedyWarning, RowCell, WarnFix } from "@/lib/kedyTimeline";
import { usePlanDay } from "@/lib/planDay";
import { getSunTimes } from "@/lib/sun";
import { useTripSettings } from "@/lib/tripSettings";
import type { Closure, LatLng, TransitMode } from "@/lib/types";
import type { BadSky, SkyKind } from "@/lib/weather";
import { FORECAST_DAYS, tripWeatherReport, weatherNotes } from "@/lib/weather";
import { badSkySvg, hourSkySvg, nightSkySvg } from "@/lib/weatherIcons";
import { clock, clockShort } from "@/lib/zoned";

type T = ReturnType<typeof useT>;

const MIN = 60000;
/** Between a number and its unit, and inside a time span: never breaks. */
const NB = " ";

/** What "Kedy" needs from the trip page: values TripPlanner already has. */
export interface KedyProps {
  /** Null while no plan can be made (no sun times). */
  plan: DayPlan | null;
  /** The ride is still being worked out: no warnings from a guess. */
  loading: boolean;
  weather: TripWeather;
  /** The day strip's bad days (rain, snow...) in the forecast. */
  dayWeather?: Record<string, BadSky>;
  /** "Dnes" / "Zajtra" / "Sobota 14. 11.", already translated. */
  dayWord: string;
  transit: boolean;
  walking: boolean;
  /** Train or bus, for the ride's icon and word. */
  stopMode: TransitMode | null;
  /**
   * The words for a start that is too late ("Späť by ste boli po západe slnka. Vyrazte najneskôr o 7:25."), built for the time
   * the step sets (pass startWord "Vyrazte" with a leg, "Začnite túru" without); null when nothing is late. The argument is the latest such time.
   */
  lateText: ((latestStart: string) => string) | null;
  latestPassed: boolean;
  tooLong: boolean;
  tanapLate: "late" | "early" | null;
  /** Where the sun times are computed (the trailhead): a drier day must fit that day's daylight too. */
  sun: LatLng | null;
  closures?: Closure[];
  /** "Počítame cestu autom…" while the ride loads, already translated; null otherwise. */
  driveNote?: string | null;
  /** A time typed in the field (HH:MM, the departure, or the walk start without a leg): TripPlanner starts its "Naozaj o 3:00?" check from it. */
  onTyped?: (typed: string) => void;
}

/** Slovak/English word of the way, for "auto 55 min" at the bar's ends. */
function wayOf(p: Pick<KedyProps, "transit" | "walking" | "stopMode">): "car" | "bus" | "train" | "foot" {
  return p.walking ? "foot" : p.transit ? (p.stopMode === "autobus" ? "bus" : "train") : "car";
}

const WAY_WORD = { car: "auto", bus: "autobus", train: "vlak", foot: "pešo" } as const;

function wayWord(way: ReturnType<typeof wayOf>, t: T): string {
  return t(WAY_WORD[way]);
}

const WAY_ICON = { car: "car", bus: "bus", train: "train", foot: "walker" } as const;

/** The moments on one line: a time span's dash never breaks. */
const span = (a: string, b: string) => `${a}⁠–⁠${b}`;

// ---------------------------------------------------------------------------------------------------------
// The model: cards and warnings, shared by the body and the folded header

/** Sunrise and sunset of another day at the trailhead (a day's walk moved there must fit its light). */
function sunForDay(at: LatLng | null) {
  return (iso: string) => {
    if (!at) return null;
    const [y, m, d] = iso.split("-").map(Number);
    const s = getSunTimes(new Date(Date.UTC(y, m - 1, d)), at.lat, at.lon);
    return s ? { sunrise: s.sunrise, sunset: s.sunset } : null;
  };
}

/**
 * Each warning on its own (Peter, 2026-11-12: never rain, frost and after-dark in one box), with its cause and,
 * where there is one, its way out as a tap. Nothing the old step or the recap showed is dropped: the late start,
 * a start before sunrise, the TANAP daylight rule, rain or snow, storms, wind and frost. `cards` null: only the list is needed.
 * The ways out are times to set: departures with a leg (Peter, 2026-11-13), the walk start without one.
 */
/** `dayFix`: the best dry day from the day tiles, offered when no drier time the same day exists. */
export function kedyWarnings(p: KedyProps, t: T, lang: Lang, cards: KedyCard[] | null, dayFix: WarnFix | null = null): KedyWarning[] {
  const plan = p.plan;
  if (!plan || p.loading) return [];
  const out: KedyWarning[] = [];
  const current = hhmmToMin(clock(startTime(plan)));
  const latest = latestSetStart(plan);
  const untilFix: WarnFix | null = !p.tooLong && !p.latestPassed && hhmmToMin(clock(latest)) < current ? { kind: "time", start: clock(latest), way: "until" } : null;
  // The first 5 minutes that put the walk at or after sunrise (with a leg: the departure that far before it).
  const afterRise = new Date(Math.ceil((plan.sunrise.getTime() - (plan.hikeStart.getTime() - startTime(plan).getTime())) / (5 * MIN)) * 5 * MIN);
  const afterFix: WarnFix = { kind: "time", start: clock(afterRise), way: "after" };

  if (p.lateText) out.push({ key: "late", tone: "warn", text: p.lateText(clockShort(latest)), fix: untilFix });
  if (plan.startsInDark) out.push({ key: "dark", tone: "warn", text: t("Túra začína pred východom slnka, vezmite si čelovku."), fix: afterFix });
  if (p.tanapLate) {
    out.push({
      key: "tanap",
      tone: "warn",
      text:
        p.tanapLate === "late"
          ? t("V TANAP-e sa mimo obcí smie chodiť len od východu do západu slnka. Vyrazte skôr alebo vyberte kratší výlet.")
          : t("V TANAP-e sa mimo obcí smie chodiť len od východu do západu slnka. Vyrazte až po východe slnka."),
      fix: p.tanapLate === "late" ? untilFix : afterFix,
    });
  }

  const below = p.weather.below;
  if (below && !p.weather.loading) {
    const notes = weatherNotes(below, p.weather.above, plan.hikeStart, plan.hikeEnd, lang);
    const stormy = notes.some((n) => n.strong);
    // By bus or train the window is the whole day out: waiting at a stop is outdoors too.
    const from = p.transit ? plan.segments[0].start : plan.hikeStart;
    const to = p.transit ? plan.segments[plan.segments.length - 1].end : plan.hikeEnd;
    const wet = tripWeatherReport(below, p.weather.above, from, to, { from: plan.hikeStart, to: plan.hikeEnd }, lang)?.wet ?? null;
    const dry = cards ? (dryFix(cards) ?? dayFix) : null;
    if (wet && !stormy) out.push({ key: "wet", tone: "warn", text: wetText(wet, lang), fix: dry });
    notes.forEach((n, i) => out.push({ key: `weather-${i}`, tone: n.strong ? "danger" : "warn", text: n.text, fix: n.strong ? dry : null }));
  }
  return out;
}

/**
 * The folded header with the warning sign when the step has a warning: "Zajtra · odchod 8:00 · doma 19:03" with a leg
 * (Peter, 2026-11-13), "Zajtra · 8:00–15:10" without one (the walk's own times).
 */
export function kedySummary(p: KedyProps, t: T, lang: Lang): { summary: ReactNode; warn: boolean } {
  if (!p.plan || p.loading) return { summary: <>{p.dayWord} · …</>, warn: false };
  const s = summaryParts(p.plan);
  return {
    summary: (
      <>
        {p.dayWord} ·{" "}
        {s.leave ? (
          <>
            {t("odchod")} <span className="font-data">{s.leave}</span>
          </>
        ) : (
          <span className="font-data">{span(s.start, s.end)}</span>
        )}
        {s.home && (
          <>
            {" · "}
            {t("doma")} <span className="font-data">{s.home}</span>
          </>
        )}
      </>
    ),
    warn: kedyWarnings(p, t, lang, null).length > 0,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Small drawing pieces

const SIGN_BAD: Partial<Record<SkyKind, Parameters<typeof badSkySvg>[0]>> = {
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

/** One sky as a glyph: sun in the sun yellow, cloud grey, a night sky in the night ink; what falls in its own colours. */
function Sky({ kind, night, size, onNight = false }: { kind: SkyKind; night: boolean; size: number; onNight?: boolean }) {
  const bad = SIGN_BAD[kind];
  const sunny = kind === "clear" || kind === "fair" || kind === "partly";
  const color = night ? (onNight ? "var(--night-ink)" : "var(--foreground)") : sunny ? "var(--sun)" : "var(--muted)";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="shrink-0"
      style={{ color }}
      aria-hidden="true"
      // Constant markup (lib/weatherIcons.ts).
      dangerouslySetInnerHTML={{ __html: bad ? badSkySvg(bad, false) : night ? nightSkySvg(kind) : hourSkySvg(kind) }}
    />
  );
}

const WET_WORD: Record<"rain" | "snow" | "sleet", string> = { rain: "dážď", snow: "sneženie", sleet: "dážď so snehom" };

/** "dážď so snehom na začiatku" / "sucho" / "sucho, po tme": the card's short weather phrase. */
function phrase(c: KedyCard, t: T): string {
  const parts: string[] = [];
  if (c.storm) parts.push(t("búrky alebo silný dážď"));
  else if (c.wet) parts.push(c.wet.atStart ? t("{what} na začiatku", { what: t(WET_WORD[c.wet.kind]) }) : `${t(WET_WORD[c.wet.kind])} ${c.wet.when.replaceAll(":00", "").replace("–", "⁠–⁠")}`);
  else if (c.known) parts.push(t("sucho"));
  if (c.afterSunset) parts.push(t("po tme"));
  return parts.join(", ");
}

/** The consequence line of a card that is not the pick: the wet hours and when you would be home. Null when there is none. */
function consequence(c: KedyCard, t: T): ReactNode | null {
  if (!c.wet && !c.storm && !c.afterSunset) return null;
  const wet = c.storm ? t("búrky alebo silný dážď") : c.wet ? `${t(WET_WORD[c.wet.kind])} ${c.wet.when.replaceAll(":00", "").replace("–", "⁠–⁠")}` : null;
  return (
    <>
      {wet}
      {wet && (c.homeText || c.afterSunset) ? " · " : ""}
      {/* Without a start there is no "doma": the walk's end is what falls after sunset. */}
      {c.homeText ? (
        <>
          {t("doma")} <span className="font-data">{c.homeText}</span>
        </>
      ) : (
        c.afterSunset && (
          <>
            {t("koniec túry")} <span className="font-data">{c.endText}</span>
          </>
        )
      )}
      {c.afterSunset ? `, ${t("po západe slnka")}` : ""}
    </>
  );
}

function dayLabel(iso: string, today: string | null, lang: Lang, t: T): string {
  if (today && iso === today) return t("Dnes");
  if (today && iso === addDaysIso(today, 1)) return t("Zajtra");
  const w = longDay(iso, lang).split(" ")[0];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}`;
}

// ---------------------------------------------------------------------------------------------------------
// Option cards

function Card({ card, today, onPick, children }: { card: KedyCard; today: string | null; onPick: () => void; children?: ReactNode }) {
  const t = useT();
  const lang = useLang();
  const title = card.sameDay ? null : dayLabel(card.date, today, lang, t);
  const words = card.best && !card.sameDay ? t("najlepšie") : phrase(card, t);
  const skies = card.skies.map((s, i) => <Sky key={i} kind={s.kind} night={s.night} size={20} />);
  const head = (
    <span className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={`mt-1.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 ${card.selected ? "border-[var(--accent)]" : "border-[var(--card-edge)]"}`}
      >
        {card.selected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="whitespace-nowrap">
          {title && <span className="mr-1.5 text-base font-bold">{title}</span>}
          <span className="font-data text-[28px] leading-none font-semibold">{card.startText}</span>
        </span>
        {/* Its own line under the time: wrapped beside it, it started with a lone "·" (13 Nov preview). */}
        {words && <span className="mt-1 min-w-0 basis-full text-[13.5px] leading-tight font-bold">{words}</span>}
      </span>
      <span className="mt-1 flex shrink-0 items-center gap-0.5">{skies}</span>
    </span>
  );
  const consequent = !card.selected ? consequence(card, t) : null;
  const detail = !card.selected && (
    <span className="mt-1 flex flex-col gap-1 pl-8 text-[13px] leading-snug">
      {!card.sameDay && (
        <span className="text-[var(--muted)]">
          {shortDate(card.date, lang)} · {t("túra")} <span className="font-data text-[15px] text-[var(--foreground)]">{span(card.walkText, card.endText)}</span>
          {card.tempMin !== null && card.tempMax !== null && ` · ${temps(card.tempMin, card.tempMax, lang)}`}
        </span>
      )}
      {consequent ? (
        <span className={`flex items-start gap-1.5 ${card.storm ? "text-[var(--danger)]" : "text-[var(--warn)]"}`}>
          <UiIcon name="warn" size={15} className="mt-0.5" />
          <span>{consequent}</span>
        </span>
      ) : (
        card.sameDay && (
          <span className="text-[var(--muted)]">
            {t("túra")} <span className="font-data text-[15px] text-[var(--foreground)]">{span(card.walkText, card.endText)}</span>
            {card.homeText && (
              <>
                {" · "}
                {t("doma")} <span className="font-data text-[15px] text-[var(--foreground)]">{card.homeText}</span>
              </>
            )}
          </span>
        )
      )}
      {card.best && !card.sameDay && (
        <span className="w-fit rounded-full bg-[var(--ok-bg)] px-3 py-1 text-[13px] font-bold text-[var(--ok)]">{t("najlepšie")}</span>
      )}
    </span>
  );
  if (!card.selected) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-bg)] px-3.5 py-3 text-left hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {head}
        {detail}
      </button>
    );
  }
  return (
    <div aria-current="true" className="flex flex-col gap-3 rounded-xl border border-[var(--accent)] bg-[var(--background)] px-4 py-3.5">
      {head}
      {children}
    </div>
  );
}

function temps(a: number, b: number, lang: Lang): string {
  const m = (n: number) => String(n).replace("-", "−");
  const text = a === b ? `${m(a)}${NB}°C` : lang === "en" ? `${m(a)} to ${m(b)}${NB}°C` : `${m(a)} až ${m(b)}${NB}°C`;
  return text;
}

// ---------------------------------------------------------------------------------------------------------
// The control: field and slider

/** The plan's day, to open the track again at the trip when the day changes. */
const clockDateKey = (plan: DayPlan) => isoDate(plan.hikeStart);

/**
 * The start: a time field (above the track), and the track: ONE sideways-scrolling strip holding the slider, the trip bar and
 * the hour row on the same 0:00-24:00 scale, so they stay aligned while you swipe (Peter, 2026-11-12). About 14 hours fit on
 * screen, as before; it opens with the trip (leaving an hour earlier) at the left edge.
 */
function StartBlock({
  plan,
  strip,
  cells,
  way,
  late,
  onSet,
  onTyped,
}: {
  plan: DayPlan;
  strip: HourCell[] | null;
  cells: RowCell[];
  way: ReturnType<typeof wayOf>;
  late: boolean;
  onSet: (hhmm: string) => void;
  onTyped?: (hhmm: string) => void;
}) {
  const t = useT();
  // With a leg before the walk the field is the departure from home (Peter, 2026-11-13); without one, the walk's start.
  const leg = hasLeg(plan);
  const fieldWord = t(leg ? "Odchod z domu" : "Začiatok túry");
  const parts = summaryParts(plan);
  const current = clock(startTime(plan));
  const [typed, setTyped] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const shown = dragged ?? typed ?? current;
  const min = Math.min(SCALE_TO_MIN - 5, Math.max(0, hhmmToMin(shown)));
  const field = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const leaveMin = dayMinutes(plan.segments[0].start, plan.hikeStart);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="kedy-start" className="shrink-0 text-[15px] font-bold whitespace-nowrap">
          {fieldWord}
        </label>
        {/* iPhone Safari draws a time input at its own width, whatever the CSS says, so it ran off the screen (Peter,
            2026-11-14). The box is ours: the time as plain text and our clock icon; the real input lies invisible over it
            and takes the tap, which opens the system's own time picker (same trick as the "Iný deň" tile). */}
        <span className="relative flex max-w-[9.5rem] min-w-0 flex-1 items-center rounded-xl border border-[var(--card-edge)] bg-[var(--card-bg)] py-1.5 pr-1 pl-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]">
          <span aria-hidden="true" className="font-data min-w-0 flex-1 truncate text-[1.45rem] leading-tight font-semibold min-[380px]:text-[1.6rem]">
            {shown}
          </span>
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center text-[var(--accent)]">
            <UiIcon name="clock" size={22} />
          </span>
          <input
            ref={field}
            id="kedy-start"
            type="time"
            step={300}
            value={shown}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                // Not supported or already open: the tap on the input opens it.
              }
            }}
            onChange={(e) => {
              if (!e.target.value) return;
              setTyped(e.target.value);
              onSet(e.target.value);
              onTyped?.(e.target.value);
            }}
            onBlur={() => setTyped(null)}
            // 16 px: an iPhone zooms into a smaller-text field when it is tapped (the field itself is invisible).
            className="absolute inset-0 h-full w-full min-w-0 cursor-pointer appearance-none text-base opacity-0"
          />
        </span>
      </div>
      {/* What the departure makes of the day, quietly: the walk's own times and when you are home. */}
      {leg && (
        <p className="text-[13px] leading-snug text-[var(--muted)]">
          {t("túra")} <span className="font-data text-[15px] text-[var(--foreground)]">{span(parts.start, parts.end)}</span>
          {parts.home && (
            <>
              {" · "}
              {t("doma")} <span className="font-data text-[15px] text-[var(--foreground)]">{parts.home}</span>
            </>
          )}
        </p>
      )}
      {/* The strip reaches into the card's padding (so a thumb at the day's ends is whole); the track is 24/14 of the card's inner width. */}
      <ScrollStrip scrollerRef={scroller} className="-mx-4 px-4" startKey={clockDateKey(plan)} startAt={(el) => scalePos(leaveMin - 60) * ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0)}>
        <div className="relative" style={{ width: `${(24 / VISIBLE_HOURS) * 100}%` }}>
          <TrackSlider
            min={min}
            valueText={`${fieldWord} ${clockShort(startTime(plan))}`}
            label={fieldWord}
            scroller={scroller}
            onChange={(v) => {
              setDragged(v);
              onSet(v);
            }}
            onRelease={() => setDragged(null)}
          />
          <BarLabels plan={plan} way={way} late={late} />
          <TripBar plan={plan} strip={strip ?? []} way={way} />
          <div className="mt-2">
            <HourRow plan={plan} cells={cells} />
          </div>
        </div>
      </ScrollStrip>
    </div>
  );
}

/**
 * The slider in the track's own coordinates. A swipe on the track scrolls it; only a drag on the thumb changes the time
 * (the thumb has touch-action none and captures the pointer). The native range stays for keyboard and screen readers: hidden
 * and not pointer-reachable, its focus ring is drawn on the thumb. Near the visible edge a drag scrolls the track along.
 */
function TrackSlider({
  min,
  label,
  valueText,
  scroller,
  onChange,
  onRelease,
}: {
  min: number;
  label: string;
  valueText: string;
  scroller: RefObject<HTMLDivElement | null>;
  onChange: (hhmm: string) => void;
  onRelease: () => void;
}) {
  const pos = scalePos(min);
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; x: number; raf: number } | null>(null);
  const timeAt = (x: number, dx: number) => {
    const r = rail.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (x - dx - r.left) / r.width));
    return minToHhmm(Math.min(SCALE_TO_MIN - 5, snapTime(f * SCALE_TO_MIN * MIN, 5) / MIN));
  };
  const stop = () => {
    const d = drag.current;
    if (d) cancelAnimationFrame(d.raf);
    drag.current = null;
    onRelease();
  };
  useEffect(
    () => () => {
      if (drag.current) cancelAnimationFrame(drag.current.raf);
    },
    []
  );
  const tick = () => {
    const d = drag.current;
    const el = scroller.current;
    if (!d || !el) return;
    // 16 px in from the strip's edges (its padding) is where the track's visible part starts.
    const r = el.getBoundingClientRect();
    const dir = d.x < r.left + 16 + 32 ? -1 : d.x > r.right - 16 - 32 ? 1 : 0;
    if (dir) {
      el.scrollBy({ left: dir * 8 });
      onChange(timeAt(d.x, d.dx));
    }
    d.raf = requestAnimationFrame(tick);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - (box.left + box.width / 2), x: e.clientX, raf: 0 };
    // Auto-scroll is movement the visitor did not ask for twice: not with reduced motion (they swipe the track instead).
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) drag.current.raf = requestAnimationFrame(tick);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.x = e.clientX;
    onChange(timeAt(d.x, d.dx));
  };
  return (
    <div className="relative h-11">
      <div ref={rail} aria-hidden="true" className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--border)]" />
      <span aria-hidden="true" className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full bg-[var(--accent)]" style={{ width: `${pos * 100}%` }} />
      <input
        type="range"
        min={0}
        max={SCALE_TO_MIN - 5}
        step={5}
        value={min}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => onChange(minToHhmm(Number(e.target.value)))}
        onKeyUp={onRelease}
        onBlur={onRelease}
        className="peer pointer-events-none sr-only"
      />
      <div
        aria-hidden="true"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        className="absolute top-1/2 z-10 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none place-items-center peer-focus-visible:[&>span]:outline-2 peer-focus-visible:[&>span]:outline-offset-2 peer-focus-visible:[&>span]:outline-[var(--accent)]"
        style={{ left: `${pos * 100}%` }}
      >
        <span className="h-8 w-8 rounded-full border-[5px] border-[var(--accent)] bg-[var(--card-bg)] shadow-[var(--shadow-card)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// The trip bar (display only)

const LEG_BG = "color-mix(in srgb, var(--accent) 24%, var(--card-bg))";
/** After dark: one night tint over every leg (70 % so the legs' colours still read), outlined in amber. */
const NIGHT_TINT = "color-mix(in srgb, var(--sky-night) 70%, transparent)";

/** The colour of a piece of the bar and the ink of what is written on it. Rain is amber, a storm red; the dark part keeps its leg's colour (the night tint covers it) with light ink. */
function pieceStyle(tone: BarPiece["tone"], leg: boolean): { background: string; color: string } {
  const base = leg ? { background: LEG_BG, color: "var(--accent)" } : { background: "var(--accent)", color: "var(--accent-contrast)" };
  switch (tone) {
    case "dark":
      return { background: base.background, color: "var(--night-ink)" };
    case "rain":
      return { background: "var(--sun)", color: "var(--sky-night)" };
    case "storm":
      return { background: "var(--danger)", color: "var(--accent-contrast)" };
    default:
      return base;
  }
}

/** What fits in a box as wide as it measures (largest first): content that does not fit is dropped, never clipped. */
function Fit({ options }: { options: { minPx: number; node: ReactNode }[] }) {
  const box = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = options.find((o) => o.minPx <= width);
  return (
    <span ref={box} className="flex h-full w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap">
      {fit?.node}
    </span>
  );
}

/**
 * The legs of the day on the fixed scale, display only: the colours, then ONE night tint over everything after sunset (no seam
 * where the hike meets the drive), then the icons and the walk's length on top.
 */
function TripBar({ plan, strip, way }: { plan: DayPlan; strip: HourCell[]; way: ReturnType<typeof wayOf> }) {
  const t = useT();
  const segs = barSegments(plan, strip);
  const dark = darkSpans(plan);
  const hikeText = formatDuration(Math.round((plan.hikeEnd.getTime() - plan.hikeStart.getTime()) / MIN));
  const box = (s: (typeof segs)[number], i: number) => ({
    className: `absolute inset-y-0 flex overflow-hidden ${i === 0 ? "rounded-l-lg" : i === segs.length - 1 ? "rounded-r-lg" : ""}`,
    style: { left: `${s.left * 100}%`, width: `${s.width * 100}%` } as CSSProperties,
  });
  return (
    <div className="relative h-10 w-full" aria-hidden="true">
      {segs.map((s, i) =>
        s.width <= 0 ? null : (
          <div key={`c-${s.kind}`} {...box(s, i)}>
            {s.pieces.map((p, j) => (
              <span key={j} className="min-w-0" style={{ background: pieceStyle(p.tone, s.kind !== "hike").background, width: `${(p.width / s.width) * 100}%` }} />
            ))}
          </div>
        )
      )}
      {dark.map((d) => (
        <div
          key={d.outer}
          className={`absolute inset-y-0 ${d.outer === "right" ? "rounded-r-lg" : "rounded-l-lg"}`}
          style={{ left: `${d.left * 100}%`, width: `${d.width * 100}%`, background: NIGHT_TINT, boxShadow: "inset 0 0 0 1.5px var(--sun)" }}
        />
      ))}
      {segs.map((s, i) => {
        if (s.width <= 0) return null;
        const hike = s.kind === "hike";
        // The piece that carries the icon and the label: the widest one.
        const widest = s.pieces.reduce((best, p, j) => (p.width > (s.pieces[best]?.width ?? 0) ? j : best), 0);
        return (
          <div key={`i-${s.kind}`} {...box(s, i)}>
            {s.pieces.map((p, j) => {
              const wet = hike && (p.tone === "rain" || p.tone === "storm");
              const icon = wet ? (
                <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true" className="shrink-0" dangerouslySetInnerHTML={{ __html: badSkySvg("rain", true) }} />
              ) : (
                <UiIcon name={hike ? "walker" : WAY_ICON[way]} size={20} />
              );
              // "túra 7 h 10 min", then "7 h 10 min", then the icon alone, then nothing, by the width the piece really has.
              const options =
                hike && !wet
                  ? [
                      { minPx: 150, node: <>{icon}<span className="font-data text-[17px] font-semibold">{t("túra")} {hikeText}</span></> },
                      { minPx: 108, node: <>{icon}<span className="font-data text-[17px] font-semibold">{hikeText}</span></> },
                      { minPx: 28, node: icon },
                    ]
                  : [{ minPx: 28, node: icon }];
              return (
                <span key={j} className="min-w-0 overflow-hidden" style={{ color: pieceStyle(p.tone, !hike).color, width: `${(p.width / s.width) * 100}%` }}>
                  {(wet || j === widest) && <Fit options={options} />}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The end labels over the bar: "odchod 7:05 / auto 55 min" at the left end and "doma 16:05 / auto 55 min" at the right.
 * One wrapping row spanning the bar: the labels cannot overlap, and when they do not fit side by side "doma" drops
 * to its own line at the right. Near the scale's right edge the row reaches left instead of overflowing.
 */
function BarLabels({ plan, way, late }: { plan: DayPlan; way: ReturnType<typeof wayOf>; late: boolean }) {
  const t = useT();
  const ends = barEnds(plan);
  const word = wayWord(way, t);
  const ride = (min: number) =>
    min > 0 && (
      <span className="block text-[13px] leading-tight whitespace-nowrap text-[var(--muted)]">
        {word} <span className="font-data text-[15px] font-semibold">{formatDuration(min)}</span>
      </span>
    );
  const right = ends.home ? ends.home.left : ends.leave.left;
  return (
    <div aria-hidden="true" className="w-full">
      <div
        className="flex flex-wrap justify-between gap-x-3 gap-y-1"
        style={{ marginLeft: `min(${ends.leave.left * 100}%, calc(100% - 13rem))`, marginRight: `max(0px, min(${(1 - right) * 100}%, calc(100% - ${ends.leave.left * 100}% - 16rem)))` }}
      >
        <div className="whitespace-nowrap">
          <span className="block text-[13px] leading-tight">
            {/* No ride (no start set, or on foot from the door): the left end is the walk's start, not a departure. */}
            {ends.leave.rideMin > 0 ? t("odchod") : t("začiatok túry")} <span className="font-data text-[19px] font-semibold">{clockShort(plan.segments[0].start)}</span>
          </span>
          {ride(ends.leave.rideMin)}
        </div>
        {ends.home && (
          <div className="ml-auto text-right whitespace-nowrap">
            <span className="block text-[13px] leading-tight">
              {t("doma")}{" "}
              <span className="font-data text-[19px] font-semibold" style={late ? { color: "var(--time)" } : undefined}>
                {clockShort(plan.segments[plan.segments.length - 1].end)}
              </span>
            </span>
            {ride(ends.home.rideMin)}
          </div>
        )}
      </div>
      <div className="relative h-2">
        <span className="absolute bottom-0 h-2 w-px bg-[var(--muted)]" style={{ left: `${ends.leave.left * 100}%` }} />
        {ends.home && <span className="absolute bottom-0 h-2 w-px bg-[var(--muted)]" style={{ left: `${ends.home.left * 100}%` }} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// The hour row

function HourRow({ plan, cells }: { plan: DayPlan; cells: RowCell[] }) {
  const t = useT();
  const marks = sunMarks(plan);
  const cell = (c: RowCell) => {
    const style = c.state === "rain" ? "bg-[var(--warn-bg)] text-[var(--warn)]" : c.state === "storm" ? "bg-[var(--danger-bg)] text-[var(--danger)]" : c.dark ? "text-[var(--night-ink)]" : "text-[var(--muted)]";
    return (
      <span
        key={c.t}
        className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1.5 ${style} ${c.state === "ring" ? "ring-2 ring-[var(--sun)] ring-inset" : ""}`}
      >
        {c.kind ? <Sky kind={c.kind} night={c.dark} size={18} onNight={c.dark} /> : <span className="h-[18px]" />}
        <span className="font-data text-[13px] leading-none font-semibold">{c.h}</span>
      </span>
    );
  };
  return (
    <div>
      <div className="grid rounded-xl" style={{ gridTemplateColumns: `repeat(${SCALE_HOURS.length}, minmax(0, 1fr))`, background: dayBand(plan) }} role="img" aria-label={t("Počasie hodinu po hodine")}>
        {cells.map(cell)}
      </div>
      <div aria-hidden="true" className="relative h-12">
        {marks.map((m) => {
          // At the track's right end the time goes to the left of the glyph, so it stays inside the track.
          const flip = m.left > 0.92;
          return (
            <div key={m.kind} className="absolute top-0" style={{ left: `${m.left * 100}%` }}>
              <span className="absolute top-0 left-0 h-3 w-0.5 -translate-x-1/2 bg-[var(--sun)]" />
              <span className={`absolute top-3 flex items-center gap-1 ${flip ? "right-0 -mr-[13px] flex-row-reverse" : "left-0 -ml-[13px]"}`}>
                <UiIcon name={m.kind === "rise" ? "sunrise" : "sunset"} size={26} />
                <span className="font-data text-[16px] font-semibold">{hm(m.min)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hm(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------------------
// The step

/**
 * What goes inside <PlanStep id="when">, the last step of "Váš plán" (Peter, 2026-11-12, mockup round 6 M1): the day,
 * the option cards, and inside the picked card the start (field + slider), the day's bar and the hour row on one fixed
 * scale, the warnings each with its way out, and the latest start.
 */
export function KedyBody(p: KedyProps) {
  const t = useT();
  const lang = useLang();
  const { today, update } = useTripSettings();
  const day = usePlanDay();
  const { plan } = p;
  const [memo, setMemo] = useState<{ date: string; kept: KedyCandidate[] } | null>(null);
  const date = plan ? isoDate(plan.hikeStart) : null;
  const ready = !!plan && !p.loading;
  const known = !!plan && !!p.weather.below && !p.weather.loading;

  // Cards (and the slider inside the selected one) stay up while a new start re-plans the ride: hiding them
  // while loading unmounted the slider mid-drag. Warnings still wait for `ready`.
  const cards =
    plan && date
      ? kedyCards({
          plan,
          forecast: { below: known ? p.weather.below : null, above: p.weather.above },
          kept: memo && memo.date === date ? memo.kept : [],
          now: new Date(),
          sunFor: sunForDay(p.sun),
        })
      : [];
  // One tile per day to the end of the forecast; the best dry day is also the way out of a wet walk (when no drier time exists).
  const tiles =
    plan && today
      ? dayTiles({
          plan,
          forecast: { below: known ? p.weather.below : null, above: p.weather.above },
          today,
          now: new Date(),
          count: FORECAST_DAYS,
          sunFor: sunForDay(p.sun),
          closed: (iso) => activeClosures(p.closures ?? [], iso).length > 0,
        })
      : [];
  const bestDay = tiles.find((x) => x.best && !x.selected);
  const warnings = kedyWarnings(p, t, lang, cards, plan && bestDay ? { kind: "day", date: bestDay.iso, start: clock(startTime(plan)) } : null);
  // The hours of the scale with their forecast; the row, the bar's wet parts and the card all read from it.
  const strip =
    plan && p.weather.below
      ? hourStrip(p.weather.below, rowRange(plan), plan.segments[0].start, plan.hikeStart, plan.hikeEnd, plan.segments[plan.segments.length - 1].end)
      : null;
  const cells = plan ? rowCells(plan, strip ?? []) : null;

  const setStart = (hhmm: string) => day?.setStart(hhmm);
  const apply = (fix: WarnFix) => {
    if (fix.kind === "day") update({ date: fix.date });
    if (!plan || fix.start !== clock(startTime(plan))) setStart(fix.start);
  };
  const pick = (card: KedyCard) => {
    if (!date) return;
    setMemo({ date: card.date, kept: keptAfterPick(cards, card) });
    if (card.date !== date) update({ date: card.date });
    if (!plan || card.start !== clock(startTime(plan))) setStart(card.start);
  };

  const way = wayOf(p);
  const limit = plan && ready && !p.tooLong && !p.latestPassed ? clockShort(latestSetStart(plan)) : null;
  const leg = !!plan && hasLeg(plan);
  const homeAfterSunset = !!plan && plan.segments[plan.segments.length - 1].end > plan.sunset;

  return (
    <>
      {plan && tiles.length > 0 && <KedyDays tiles={tiles} current={date} />}
      {plan && cards.length ? (
        <div className="flex flex-col gap-2.5">
          {cards.map((card) => (
            // The selected card keeps one key while its time changes: keyed by time, every slider step remounted
            // it and the browser dropped the drag after the first step (Peter, 12 Nov: "only moves when I click").
            <Card key={card.selected ? "selected" : card.key} card={card} today={today} onPick={() => pick(card)}>
              {card.selected && (
                <>
                  <StartBlock plan={plan} strip={strip} cells={cells!} way={way} late={homeAfterSunset} onSet={setStart} onTyped={p.onTyped} />
                  {!strip && <p className="text-sm text-[var(--muted)]">{p.weather.loading ? t("Načítavame predpoveď počasia…") : p.weather.strip ? t("Predpoveď na tento deň ešte nie je.") : ""}</p>}
                  <Warnings warnings={warnings} leg={leg} onFix={apply} />
                  {limit && (
                    <p className="text-[13.5px] text-[var(--muted)]">
                      {t(leg ? "Najneskôr vyrazte o" : "Najneskôr začnite túru o")} <span className="font-data text-[17px] font-semibold text-[var(--time)]">{limit}</span>
                      {t(", aby ste boli dole za svetla.")}
                    </p>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">{p.driveNote ?? "…"}</p>
      )}
      {p.driveNote && plan && ready && <p className="text-xs text-[var(--muted)]">{p.driveNote}</p>}
    </>
  );
}

function Warnings({ warnings, leg, onFix }: { warnings: KedyWarning[]; leg: boolean; onFix: (f: WarnFix) => void }) {
  const t = useT();
  const lang = useLang();
  if (warnings.length === 0) return null;
  const link = (fix: WarnFix): ReactNode => {
    const time = <span className="font-data text-[16px]">{fix.start.replace(/^0/, "")}</span>;
    if (fix.kind === "day") {
      return (
        <>
          {t("Skúste")} {dayInSentence(fix.date, new Date(), lang)} {t("o")} {time}, {t("bez zrážok")}
        </>
      );
    }
    return fix.way === "dry" ? (
      <>
        {t(leg ? "Odchod o" : "Začiatok o")} {time} {t("je bez dažďa")}
      </>
    ) : fix.way === "until" ? (
      <>
        {t(leg ? "Vyrazte do" : "Začnite do")} {time}
      </>
    ) : (
      <>
        {t(leg ? "Vyrazte o" : "Začnite o")} {time}
      </>
    );
  };
  return (
    <ul className="flex flex-col gap-2.5">
      {warnings.map((w) => (
        <li key={w.key} className={`flex items-start gap-2 text-[14.5px] leading-snug font-semibold ${w.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--warn)]"}`}>
          <UiIcon name="warn" size={18} className="mt-0.5" />
          <span>
            {w.text}
            {w.fix && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => onFix(w.fix!)}
                  className="font-bold whitespace-normal text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {link(w.fix)} &rsaquo;
                </button>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
