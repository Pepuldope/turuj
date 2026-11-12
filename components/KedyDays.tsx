"use client";

import { useEffect, useRef } from "react";
import { ScrollStrip, scrollBehavior } from "@/components/ScrollStrip";
import { UiIcon } from "@/components/UiIcon";
import { track } from "@/lib/analytics";
import { shortDate, shortDay } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import type { DayTile } from "@/lib/kedyTimeline";
import { useTripSettings } from "@/lib/tripSettings";
import type { SkyKind } from "@/lib/weather";
import { badSkySvg, hourSkySvg } from "@/lib/weatherIcons";

const BAD: Partial<Record<SkyKind, Parameters<typeof badSkySvg>[0]>> = {
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

function DaySky({ kind }: { kind: SkyKind }) {
  const bad = BAD[kind];
  const sunny = kind === "clear" || kind === "fair" || kind === "partly";
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      aria-hidden="true"
      className="shrink-0"
      style={{ color: sunny ? "var(--sun)" : "var(--muted)" }}
      // Constant markup (lib/weatherIcons.ts).
      dangerouslySetInnerHTML={{ __html: bad ? badSkySvg(bad, false) : hourSkySvg(kind) }}
    />
  );
}

const tileBase = "flex h-full w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/**
 * "Ktorý deň?": a swipeable row of day tiles with the walk's weather for each, the best day marked, so the day is a visible
 * choice and a wet day is one tap from a better one (Peter, 2026-11-12). Tapping a tile moves the trip to that day.
 */
export function KedyDays({ tiles, current }: { tiles: DayTile[]; current: string | null }) {
  const t = useT();
  const lang = useLang();
  const { today, update } = useTripSettings();
  const scroller = useRef<HTMLDivElement>(null);
  const picked = tiles.find((x) => x.selected)?.iso ?? null;
  // The picked tile is brought into view (to the middle), also when the day is changed from a warning's link.
  useEffect(() => {
    const el = scroller.current;
    const tile = el?.querySelector<HTMLElement>("[data-selected]");
    if (!el || !tile) return;
    el.scrollTo({ left: tile.offsetLeft - (el.clientWidth - tile.offsetWidth) / 2, behavior: scrollBehavior() });
  }, [picked]);
  const other = current !== null && !tiles.some((x) => x.iso === current);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-bold">{t("Ktorý deň?")}</h3>
      <ScrollStrip scrollerRef={scroller} className="-mx-1 px-1 pb-1">
        <div role="group" aria-label={t("Deň výletu")} className="flex w-max items-stretch gap-1.5">
          {tiles.map((x, i) => {
            const sd = shortDay(x.iso, lang);
            const label = x.when === "today" ? t("Dnes") : x.when === "tomorrow" ? t("Zajtra") : sd.split(" ")[0];
            const date = shortDate(x.iso, lang);
            const washed = x.state !== "ok";
            return (
              <button
                key={x.iso}
                type="button"
                aria-pressed={x.selected}
                data-selected={x.selected ? "" : undefined}
                onClick={() => {
                  track("day_pick", { day: i === 0 ? "dnes" : i === 1 ? "zajtra" : "iny" });
                  update({ date: x.iso });
                }}
                className={`${tileBase} ${x.selected ? "border-[var(--accent)] bg-[var(--background)]" : "border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent)]"}`}
              >
                <span className="flex flex-col leading-tight">
                  <span className={`text-[13.5px] font-bold ${x.selected ? "text-[var(--accent)]" : ""}`}>{label}</span>
                  <span className="text-[12px] whitespace-nowrap text-[var(--muted)]">{date}</span>
                </span>
                <span className={`flex flex-col items-center gap-0.5 ${washed ? "opacity-45" : ""}`}>
                  {x.kind ? <DaySky kind={x.kind} /> : <span className="h-6" />}
                  <span className="font-data h-[18px] text-[16px] leading-[18px] font-semibold">{x.tempMax !== null ? `${String(x.tempMax).replace("-", "−")}°` : ""}</span>
                </span>
                <span className="flex min-h-[20px] items-center">
                  {x.best ? (
                    <span className="rounded-full bg-[var(--ok-bg)] px-2 py-0.5 text-[11.5px] leading-tight font-bold text-[var(--ok)]">{t("najlepšie")}</span>
                  ) : x.state === "short" ? (
                    <span className="text-[11.5px] leading-tight text-[var(--muted)]">{t("krátky deň")}</span>
                  ) : x.state === "closed" ? (
                    <span className="text-[11.5px] leading-tight text-[var(--muted)]">{t("uzávera")}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {/* The same calendar the home screen uses: the date input itself takes the tap (an invisible input over the tile). */}
          <span
            className={`${tileBase} relative justify-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)] ${
              other ? "border-[var(--accent)] bg-[var(--background)]" : "border-[var(--border)] bg-[var(--card-bg)]"
            }`}
            {...(other ? { "data-selected": "" } : {})}
          >
            <UiIcon name="cal" size={24} className="text-[var(--accent)]" />
            <span className={`text-[13.5px] leading-tight font-bold ${other ? "text-[var(--accent)]" : ""}`}>{t("Iný deň")}</span>
            {other && current && <span className="text-[12px] text-[var(--muted)]">{shortDate(current, lang)}</span>}
            <input
              type="date"
              aria-label={t("Iný deň")}
              min={today ?? undefined}
              value={current ?? ""}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {
                  // Not supported or already open: the tap on the input opens it.
                }
              }}
              onChange={(e) => {
                if (!e.target.value) return;
                track("day_pick", { day: "iny" });
                update({ date: e.target.value });
              }}
              // 16 px: an iPhone zooms into a smaller-text field when it is tapped (the field itself is invisible).
              className="absolute inset-0 h-full w-full min-w-0 cursor-pointer appearance-none text-base opacity-0"
            />
          </span>
        </div>
      </ScrollStrip>
    </div>
  );
}
