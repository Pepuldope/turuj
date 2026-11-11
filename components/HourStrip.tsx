"use client";

import { useEffect, useRef } from "react";
import { hourSkySvg } from "@/lib/weatherIcons";
import { departureFor, rainFill, startHourIndex } from "@/lib/hourStrip";
import type { HourCell } from "@/lib/hourStrip";
import { weatherWords } from "@/lib/weather";
import { clock } from "@/lib/zoned";
import { useLang, useT } from "@/lib/i18n";

const COL = 46;
const GAP = 4;

/** "-2" with a real minus, for the strip's narrow columns. */
const deg = (n: number) => String(n).replace("-", "−");

/**
 * The weather hour by hour for the chosen day (Peter, 2026-11-11): a glyph, the temperature and rain as a
 * light blue fill rising from the bottom of each hour, with the walk's hours bracketed underneath.
 * Tapping an hour moves the departure so the walk starts around then. Scrolls sideways; the walk is in view.
 */
export function HourStrip({
  cells,
  hikeStart,
  lead,
  onPickTime,
  dayKey,
}: {
  cells: HourCell[];
  hikeStart: Date;
  /** Ms from leaving to the walk's start, kept when an hour is tapped. */
  lead: number;
  onPickTime: (time: string) => void;
  /** Changes with the day: the strip scrolls to the walk again. */
  dayKey: string;
}) {
  const t = useT();
  const lang = useLang();
  const scroller = useRef<HTMLDivElement>(null);
  const selected = startHourIndex(cells, hikeStart);
  const firstWalk = cells.findIndex((c) => c.part === "walk");

  // The walk in view with one spare hour before it, once per day.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, (Math.max(0, firstWalk) - 1) * (COL + GAP));
    // Only when the day changes: tapping an hour must not move the strip under the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  // Runs of the same part under the cells: the walk's bracket, the way's lighter bar.
  const bands: { part: HourCell["part"]; n: number }[] = [];
  for (const c of cells) {
    const last = bands[bands.length - 1];
    if (last && last.part === c.part) last.n++;
    else bands.push({ part: c.part, n: 1 });
  }
  const width = (n: number) => n * COL + (n - 1) * GAP;

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={scroller} className="-mx-1 overflow-x-auto px-1 pb-1" role="group" aria-label={t("Počasie hodinu po hodine")}>
        <div className="flex w-max flex-col gap-1">
          <div className="flex gap-1">
            {cells.map((c, i) => {
              const rain = rainFill(c.rain);
              const words = c.symbol ? weatherWords(c.symbol.replace(/_(day|night|polartwilight)$/, ""), lang) : "";
              const time = clock(c.t);
              return (
                <button
                  key={c.t}
                  type="button"
                  onClick={() => onPickTime(departureFor(c.t, lead))}
                  aria-pressed={i === selected}
                  aria-label={`${time}${words ? `, ${words}` : ""}${c.temp !== null ? `, ${c.temp} °C` : ""}. ${t("Začať túru v tejto hodine")}`}
                  style={{ width: COL }}
                  className={`relative flex h-[104px] shrink-0 cursor-pointer flex-col items-center gap-0.5 overflow-hidden rounded-lg border-2 pt-1.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${
                    i === selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent bg-[var(--segment-bg)] hover:border-[var(--border)]"
                  }`}
                >
                  {rain > 0 && <span aria-hidden className="absolute inset-x-0 bottom-0 bg-[var(--accent)]/30" style={{ height: `${Math.round(rain * 100)}%` }} />}
                  <span className={`font-data relative text-[15px] leading-none font-semibold ${c.part === "walk" ? "" : "text-[var(--muted)]"}`}>{time}</span>
                  {c.kind ? (
                    <svg viewBox="0 0 24 24" className="relative h-6 w-6 text-[var(--foreground)]" aria-hidden="true" dangerouslySetInnerHTML={{ __html: hourSkySvg(c.kind) }} />
                  ) : (
                    <span aria-hidden className="relative h-6 w-6" />
                  )}
                  <span className="font-data relative text-[17px] leading-none font-semibold">{c.temp !== null ? `${deg(c.temp)}°` : "–"}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-1" aria-hidden="true">
            {bands.map((b, i) => (
              <span
                key={i}
                style={{ width: width(b.n) }}
                className={`h-[18px] shrink-0 truncate rounded-md px-1 text-center text-[11px] leading-[18px] font-bold ${
                  b.part === "walk" ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : b.part === "way" ? "bg-[var(--segment-bg)] text-[var(--muted)]" : ""
                }`}
              >
                {b.part === "walk" ? t("vaša túra") : b.part === "way" && b.n >= 2 ? t("cesta") : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[12.5px] text-[var(--muted)]">{t("Modrá výplň sú zrážky. Ťuknutím na hodinu posuniete začiatok túry.")}</p>
    </div>
  );
}
