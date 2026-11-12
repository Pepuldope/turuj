"use client";

import { useEffect, useRef, useState } from "react";
import { departureFor, isDarkHour, partRuns, rainStrength, startHourIndex, walkSpan } from "@/lib/hourStrip";
import type { HourCell } from "@/lib/hourStrip";
import { weatherWords } from "@/lib/weather";
import { hourSkySvg } from "@/lib/weatherIcons";
import { formatTime } from "@/lib/format";
import { clock, wallClock } from "@/lib/zoned";
import { useLang, useT } from "@/lib/i18n";

/** "-2" with a real minus, for the narrow columns. */
const deg = (n: number) => String(n).replace("-", "−");

/** The track's tint for one hour: a light, medium or full blue over the day or night base. */
const RAIN_PERCENT = [0, 35, 65, 100] as const;

/** The least width (px) the walk's span needs to carry its times in the label. */
const LABEL_TIMES_MIN_PX = 90;

/**
 * The weather hour by hour for the day, calm and in one line: a small glyph and (every second hour) the
 * temperature above a thin track. Darkness greys the track, rain tints it blue, the walk is outlined and
 * named underneath, so a warning can be seen where it comes from (Peter, 2026-11-12). Fits the card's width.
 * Tapping an hour moves the departure so the walk starts then.
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
  /** Ms from leaving to the walk's start, kept when an hour is tapped. */
  lead: number;
  onPickTime: (time: string) => void;
}) {
  const t = useT();
  const lang = useLang();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
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
  const selected = startHourIndex(cells, hikeStart);
  const span = walkSpan(cells);
  const wayRuns = partRuns(cells, "way");
  const dark = cells.map((c) => isDarkHour(c.t, sunrise, sunset));
  const anyRain = cells.some((c) => rainStrength(c.rain) > 0);
  const anyDark = dark.some(Boolean);
  const even = (c: HourCell) => wallClock(c.t).h % 2 === 0;
  const walkWidth = span ? ((span.to - span.from + 1) / n) * width : 0;

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
        {/* The track: dark hours grey, rain blue; the walk outlined */}
        <div className="relative my-1 h-3" aria-hidden="true">
          <div className="absolute inset-0 grid overflow-hidden rounded-full bg-[var(--segment-bg)]" style={cols}>
            {cells.map((c, i) => {
              const base = dark[i] ? "var(--off-bg)" : "var(--segment-bg)";
              const p = RAIN_PERCENT[rainStrength(c.rain)];
              return <span key={c.t} style={{ background: p ? `color-mix(in srgb, var(--accent) ${p}%, ${base})` : base }} />;
            })}
          </div>
          {span && (
            <span
              className="absolute -top-[3px] -bottom-[3px] rounded-full border-2 border-[var(--accent)]"
              style={{ left: `${(span.from / n) * 100}%`, width: `${((span.to - span.from + 1) / n) * 100}%` }}
            />
          )}
        </div>
        {/* The ride there and back, a thin line */}
        {wayRuns.length > 0 && (
          <div className="grid h-0.5" style={cols} aria-hidden="true">
            {wayRuns.map(([from, count]) => (
              <span key={from} className="rounded-full bg-[var(--muted)]" style={{ gridColumn: `${from + 1} / span ${count}` }} />
            ))}
          </div>
        )}
        {/* Hour labels */}
        <div className="grid" style={cols} aria-hidden="true">
          {cells.map((c) => (
            <span key={c.t} className="font-data flex justify-center text-[12px] leading-4 whitespace-nowrap text-[var(--muted)]">
              {even(c) ? wallClock(c.t).h : ""}
            </span>
          ))}
        </div>
        {/* The walk's name under its span */}
        {span && (
          <div className="grid" style={cols} aria-hidden="true">
            <span
              className="flex justify-center text-[11px] leading-4 font-bold whitespace-nowrap text-[var(--accent)]"
              style={{ gridColumn: `${span.from + 1} / span ${span.to - span.from + 1}` }}
            >
              {t("vaša túra")}
              {walkWidth >= LABEL_TIMES_MIN_PX && (
                <span className="font-data ml-[0.3em]">
                  {formatTime(hikeStart)}–{formatTime(hikeEnd)}
                </span>
              )}
            </span>
          </div>
        )}
        {/* One button per hour, over everything above. */}
        <div className="absolute inset-0 grid" style={cols}>
          {cells.map((c, i) => {
            const words = c.symbol ? weatherWords(c.symbol.replace(/_(day|night|polartwilight)$/, ""), lang) : "";
            return (
              <button
                key={c.t}
                type="button"
                onClick={() => onPickTime(departureFor(c.t, lead))}
                aria-pressed={i === selected}
                aria-label={`${clock(c.t)}${words ? `, ${words}` : ""}${c.temp !== null ? `, ${c.temp} °C` : ""}. ${t("Začať túru v tejto hodine")}`}
                className="cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--accent)]"
              />
            );
          })}
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[var(--muted)]">
        {anyRain && <Swatch color="color-mix(in srgb, var(--accent) 65%, var(--segment-bg))" label={t("zrážky")} />}
        {anyDark && <Swatch color="var(--off-bg)" label={t("tma")} />}
        <span>{t("Ťuknutím na hodinu posuniete začiatok túry.")}</span>
      </p>
    </div>
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
