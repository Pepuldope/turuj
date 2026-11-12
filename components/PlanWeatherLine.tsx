"use client";

import { UiIcon } from "@/components/UiIcon";
import { SkyGlyph, findBetterDay } from "@/components/WeatherBlock";
import type { TripWeather } from "@/components/WeatherBlock";
import type { DayPlan } from "@/lib/dayPlan";
import { addDaysIso, dayInSentence, isoDate } from "@/lib/days";
import { useLang, useT } from "@/lib/i18n";
import { useTripSettings } from "@/lib/tripSettings";
import { weatherLine } from "@/lib/weatherLine";
import type { Closure, LatLng } from "@/lib/types";

/**
 * One line about the chosen day's weather for the walk, above the first step (Peter, 2026-11-12: Kedy is
 * the last step now, so the weather can't wait for it). Fine weather is a quiet muted line; rain, snow,
 * frost and storms are advice in the warn (or danger) colours with a way out: the nearest dry day.
 * Nothing while the forecast loads or when the day is past its range.
 */
export function PlanWeatherLine({ plan, weather, dayWord, sunAt, closures = [] }: { plan: DayPlan | null; weather: TripWeather; dayWord: string; sunAt: LatLng | null; closures?: Closure[] }) {
  const { update } = useTripSettings();
  const t = useT();
  const lang = useLang();
  if (!plan || weather.loading || !weather.below) return null;
  const line = weatherLine(weather.below, weather.above, plan.hikeStart, plan.hikeEnd, lang);
  if (!line) return null;
  const day = `${dayWord.charAt(0).toUpperCase()}${dayWord.slice(1)}`;
  const text = t("{day}: {text}", { day, text: line.text });
  if (line.tone === "fine") {
    return (
      <p className="flex items-center gap-2 px-1 text-sm text-[var(--muted)]">
        {line.sky && <SkyGlyph kind={line.sky} size={20} />}
        <span>{text}</span>
      </p>
    );
  }
  const now = new Date();
  // Only a wet or stormy walk has a better day (frost alone has none).
  const better = findBetterDay(plan, weather, sunAt, closures, now);
  const iso = better ? addDaysIso(isoDate(plan.hikeStart), better.offset) : null;
  const red = line.tone === "danger";
  return (
    <p className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm ${red ? "bg-[var(--danger-bg)] text-[var(--danger)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"}`}>
      <UiIcon name="warn" size={16} className="mt-0.5" />
      <span>
        {text}
        {iso && (
          <>
            {" · "}
            <button type="button" onClick={() => update({ date: iso })} className="cursor-pointer font-semibold text-[var(--accent)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              {t("lepšie {day}", { day: dayInSentence(iso, now, lang) })} ›
            </button>
          </>
        )}
      </span>
    </p>
  );
}
