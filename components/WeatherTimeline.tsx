"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { badHoursInSpan, clampStart, departureFor, isDarkHour, rainStrength, snapTime, timeFraction } from "@/lib/hourStrip";
import type { HourCell } from "@/lib/hourStrip";
import { hourSkySvg } from "@/lib/weatherIcons";
import { formatTime } from "@/lib/format";
import { wallClock } from "@/lib/zoned";
import { useT } from "@/lib/i18n";

/** "-2" with a real minus, for the narrow columns. */
const deg = (n: number) => String(n).replace("-", "−");

/** The track's tint for one hour: a light, medium or full blue over the day or night base. */
const RAIN_PERCENT = [0, 35, 65, 100] as const;

const HOUR = 3600000;
const STEP_MIN = 15;
/** The least band width (px) that carries the times inside it. */
const BAND_TIMES_MIN_PX = 112;
/** Hour numbers this close (px) to a sun time are left out. */
const MARKER_CLEAR_PX = 24;

/**
 * The weather hour by hour for the day: a glyph and (every second hour) the temperature above a thin track.
 * Darkness greys the track, rain tints it blue, and the hours of the walk that are wet or stormy turn amber
 * or red, so a warning is seen where it comes from. Under it a slider: the walk as a band on the same time
 * scale; drag it (or use the arrow keys) to start the hike at a better time. Fits the card's width.
 */
export function WeatherTimeline({
  cells,
  hikeStart,
  hikeEnd,
  sunrise,
  sunset,
  lead,
  onPickTime,
}: {
  cells: HourCell[];
  hikeStart: Date;
  hikeEnd: Date;
  sunrise: Date;
  sunset: Date;
  /** Ms from leaving to the walk's start, kept when the band is moved. */
  lead: number;
  onPickTime: (time: string) => void;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const grab = useRef<{ x: number; start: number } | null>(null);
  const [width, setWidth] = useState(300);
  /** The walk's start while the band is being dragged (ms); the plan changes only on release. */
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = cells.length;
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const from = cells[0].t;
  const to = cells[n - 1].t + HOUR;
  const len = hikeEnd.getTime() - hikeStart.getTime();
  const start = drag ?? hikeStart.getTime();
  const end = start + len;
  const frac = (x: number) => timeFraction(x, from, to);
  const pct = (x: number) => `${frac(x) * 100}%`;
  const bad = badHoursInSpan(cells, start, end);
  const dark = cells.map((c) => isDarkHour(c.t, sunrise, sunset));
  const anyRain = cells.some((c) => rainStrength(c.rain) > 0);
  const anyDark = dark.some(Boolean);
  const anyBad = bad.some(Boolean);
  // The part of the walk in the dark (before sunrise, after sunset), to the minute: it stands out like bad weather,
  // so the "Späť by ste boli až po tme" warning shows where it comes from (Peter, 2026-11-12).
  const darkSpans = [
    [start, Math.min(end, sunrise.getTime())],
    [Math.max(start, sunset.getTime()), end],
  ].filter(([a, b]) => b > a);
  const even = (c: HourCell) => wallClock(c.t).h % 2 === 0;
  const markers = [
    { at: sunrise.getTime(), up: true },
    { at: sunset.getTime(), up: false },
  ].filter((m) => m.at > from && m.at < to);
  const hourHidden = (c: HourCell) => markers.some((m) => Math.abs(frac(c.t + HOUR / 2) - frac(m.at)) * width < MARKER_CLEAR_PX);

  const bandPx = (len / (to - from)) * width;
  const timesInside = bandPx >= BAND_TIMES_MIN_PX;
  const times = `${formatTime(new Date(start))}–${formatTime(new Date(end))}`;
  const minutes = (x: number) => {
    const w = wallClock(x);
    return w.h * 60 + w.mi;
  };
  const place = (x: number) => clampStart(snapTime(x, STEP_MIN), len, from, to);
  const commit = (x: number) => {
    if (x !== hikeStart.getTime()) onPickTime(departureFor(x, lead));
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { x: e.clientX, start: hikeStart.getTime() };
    setDrag(hikeStart.getTime());
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    const w = rail.current?.clientWidth;
    if (!g || !w) return;
    setDrag(place(g.start + ((e.clientX - g.x) / w) * (to - from)));
  };
  const up = () => {
    if (!grab.current) return;
    grab.current = null;
    const x = drag ?? hikeStart.getTime();
    setDrag(null);
    commit(x);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    commit(place(hikeStart.getTime() + dir * (e.shiftKey ? 60 : STEP_MIN) * 60000));
  };
  const tapRail = (e: PointerEvent<HTMLDivElement>) => {
    const r = rail.current!.getBoundingClientRect();
    commit(place(from + ((e.clientX - r.left) / r.width) * (to - from)));
  };

  // The times above the band when it is too narrow to hold them, kept inside the card.
  const labelPx = 84;
  const labelLeft = Math.min(Math.max(((frac(start) + frac(end)) / 2) * width, labelPx / 2), width - labelPx / 2);

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={box} role="group" aria-label={t("Počasie hodinu po hodine")} className="relative flex flex-col gap-1 pt-1">
        {/* Glyphs */}
        <div className="grid" style={cols} aria-hidden="true">
          {cells.map((c) => (
            <span key={c.t} className={`flex h-4 justify-center ${c.part === "around" ? "text-[var(--muted)] opacity-70" : "text-[var(--foreground)]"}`}>
              {c.kind && <svg viewBox="0 0 24 24" className="h-4 w-4" dangerouslySetInnerHTML={{ __html: hourSkySvg(c.kind) }} />}
            </span>
          ))}
        </div>
        {/* Temperatures every second hour */}
        <div className="grid" style={cols} aria-hidden="true">
          {cells.map((c) => (
            <span key={c.t} className="font-data flex h-4 justify-center text-[13px] leading-4 whitespace-nowrap">
              {even(c) && c.temp !== null ? `${deg(c.temp)}°` : ""}
            </span>
          ))}
        </div>
        {/* Sunrise and sunset, at their exact time */}
        <div className="relative h-4" aria-hidden="true">
          {markers.map((m) => (
            <SunMark key={m.up ? "up" : "down"} up={m.up} left={pct(m.at)} />
          ))}
        </div>
        {/* The track: dark hours grey, rain blue; the hours of the walk that are bad stand out in amber or red */}
        <div className="relative h-3" aria-hidden="true">
          <div className="absolute inset-0 grid overflow-hidden rounded-full bg-[var(--segment-bg)]" style={cols}>
            {cells.map((c, i) => {
              const base = dark[i] ? "var(--night-bg)" : "var(--segment-bg)";
              const p = RAIN_PERCENT[rainStrength(c.rain)];
              return <span key={c.t} style={{ background: p ? `color-mix(in srgb, var(--accent) ${p}%, ${base})` : base }} />;
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 grid" style={cols}>
            {bad.map((b, i) =>
              b ? (
                <span
                  key={cells[i].t}
                  className={`-my-[3px] rounded-[3px] ring-2 ${b === "danger" ? "bg-[var(--danger)] ring-[var(--danger)]" : "bg-[var(--warn)] ring-[var(--warn)]"}`}
                  style={{ gridColumn: i + 1 }}
                />
              ) : null
            )}
          </div>
          {darkSpans.map(([a, b]) => (
            <span
              key={a}
              className="pointer-events-none absolute -top-[3px] -bottom-[3px] rounded-[3px] ring-2 ring-[var(--warn)]"
              style={{ left: pct(a), width: `${(frac(b) - frac(a)) * 100}%`, background: "repeating-linear-gradient(135deg, var(--warn) 0 3px, var(--night-bg) 3px 6px)" }}
            />
          ))}
          {markers.map((m) => (
            <span key={m.up ? "up" : "down"} className="absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 bg-[var(--sun)]" style={{ left: pct(m.at) }} />
          ))}
        </div>
        {/* Hour numbers, and the sun times */}
        <div className="relative" aria-hidden="true">
          <div className="grid" style={cols}>
            {cells.map((c) => (
              <span key={c.t} className="font-data flex justify-center text-[12px] leading-4 whitespace-nowrap text-[var(--muted)]">
                {even(c) && !hourHidden(c) ? wallClock(c.t).h : ""}
              </span>
            ))}
          </div>
          {markers.map((m) => (
            <span
              key={m.up ? "up" : "down"}
              className="font-data absolute top-0 -translate-x-1/2 text-[12px] leading-4 font-bold whitespace-nowrap text-[var(--foreground)]"
              style={{ left: `clamp(16px, ${pct(m.at)}, calc(100% - 16px))` }}
            >
              {formatTime(new Date(m.at))}
            </span>
          ))}
        </div>
        {/* The slider: the walk as a band on the same time scale */}
        <div className={`relative ${timesInside ? "mt-1" : "mt-6"}`}>
          {!timesInside && (
            <span className="font-data pointer-events-none absolute -top-5 -translate-x-1/2 text-[13px] leading-4 font-bold whitespace-nowrap text-[var(--accent)]" style={{ left: labelLeft }}>
              {times}
            </span>
          )}
          <div ref={rail} onPointerUp={tapRail} className="relative h-8 cursor-pointer rounded-full bg-[var(--segment-bg)]">
            <div
              role="slider"
              tabIndex={0}
              aria-label={t("Začiatok túry")}
              aria-valuemin={minutes(from)}
              aria-valuemax={minutes(to - len)}
              aria-valuenow={minutes(start)}
              aria-valuetext={`${t("Začiatok túry")} ${formatTime(new Date(start))}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={(e) => {
                e.stopPropagation();
                up();
              }}
              onPointerCancel={up}
              onKeyDown={key}
              style={{ left: pct(start), width: `${(len / (to - from)) * 100}%` }}
              className="absolute top-0 flex h-8 cursor-grab touch-none items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] select-none active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <span aria-hidden className="absolute left-2.5 h-3 w-0.5 rounded-full bg-[var(--accent-contrast)] opacity-70" />
              <span aria-hidden className="absolute right-2.5 h-3 w-0.5 rounded-full bg-[var(--accent-contrast)] opacity-70" />
              {timesInside && <span className="font-data text-[13px] font-bold whitespace-nowrap">{times}</span>}
            </div>
          </div>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[var(--muted)]">
        {anyRain && <Swatch color="color-mix(in srgb, var(--accent) 65%, var(--segment-bg))" label={t("zrážky")} />}
        {anyBad && <Swatch color="var(--warn)" label={t("zrážky počas túry")} />}
        {anyDark && <Swatch color="var(--night-bg)" label={t("tma")} />}
        {darkSpans.length > 0 && <Swatch color="repeating-linear-gradient(135deg, var(--warn) 0 2px, var(--night-bg) 2px 4px)" label={t("tma počas túry")} />}
        <span>{t("Posuňte túru na lepší čas.")}</span>
      </p>
    </div>
  );
}

/** A half sun on the horizon with an arrow up (sunrise) or down (sunset), centred at `left`. */
function SunMark({ up, left }: { up: boolean; left: string }) {
  return (
    <svg viewBox="0 0 24 24" className="absolute top-0 h-4 w-4 -translate-x-1/2 text-[var(--muted)]" style={{ left }}>
      <path d="M6.5 18a5.5 5.5 0 0 1 11 0z" fill="var(--sun)" />
      <path d="M3 18.5h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d={up ? "M12 10V3M9 6l3-3 3 3" : "M12 3v7M9 7l3 3 3-3"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm border border-[var(--border)]" style={{ background: color }} />
      {label}
    </span>
  );
}
