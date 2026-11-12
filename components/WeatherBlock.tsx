"use client";

import { useState } from "react";
import { SAFE_MARGIN_MIN } from "@/lib/dayPlan";
import type { DayPlan } from "@/lib/dayPlan";
import { useCachedJson } from "@/lib/useDriveRoute";
import { isoDate } from "@/lib/days";
import { activeClosures } from "@/lib/closures";
import { getSunTimes } from "@/lib/sun";
import type { SkyKind } from "@/lib/weather";
import { FORECAST_DAYS, betterDay } from "@/lib/weather";
import type { BetterDay, TripWeatherReport, WeatherForecast } from "@/lib/weather";
import { badSkySvg, hourSkySvg } from "@/lib/weatherIcons";
import type { Closure, LatLng } from "@/lib/types";
import { decimal, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

type Goal = (LatLng & { ele: number | null; name: string }) | null;

const DAY = 86400000;

function url(p: LatLng, alt?: number | null): string {
  return `/api/weather?lat=${p.lat.toFixed(4)}&lon=${p.lon.toFixed(4)}${alt ? `&alt=${Math.round(alt)}` : ""}`;
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
 * The nearest day with a dry walk at the same clock time, when the planned walk is wet or stormy (WeatherReport's
 * tip, and the one-line weather above the steps). Another day keeps the clock time, so it is checked again:
 * shorter light in autumn (a whole hour across the clock change), a closure starting that day, a departure already gone.
 */
export function findBetterDay(plan: DayPlan, weather: TripWeather, sunAt: LatLng | null, closures: Closure[], now: Date): BetterDay | null {
  if (!weather.below) return null;
  const lead = plan.hikeStart.getTime() - plan.segments[0].start.getTime();
  const fits = (a: Date, b: Date) => {
    const iso = isoDate(a);
    if (activeClosures(closures, iso).length > 0) return false;
    if (!sunAt) return true;
    const [y, m, d] = iso.split("-").map(Number);
    const sun = getSunTimes(new Date(Date.UTC(y, m - 1, d)), sunAt.lat, sunAt.lon);
    return !!sun && b.getTime() <= sun.sunset.getTime() - SAFE_MARGIN_MIN * 60000;
  };
  return betterDay(weather.below, weather.above, plan.hikeStart, plan.hikeEnd, now, { leadMin: lead / 60000, fits });
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
export function SkyGlyph({ kind, size }: { kind: SkyKind; size: number }) {
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

/** "Môže pršať 8:00–10:00 (mierne, do 0,8 mm/h). Vezmite si nepremokavú bundu." Also the warnings recap's line. The span never breaks at its dash (word joiners). */
export function wetText(wet: NonNullable<TripWeatherReport["wet"]>, lang: Lang): string {
  const how = wet.mmPerHour >= 0.1 ? tr(lang, " ({how}, do {mm} mm/h)", { how: tr(lang, wet.mmPerHour < 0.5 ? "slabo" : wet.mmPerHour < 2 ? "mierne" : "výdatne"), mm: decimal(lang, wet.mmPerHour) }) : "";
  return `${tr(lang, wet.snow ? "Môže snežiť" : wet.sleet ? "Môže pršať so snehom" : "Môže pršať")} ${wet.when.replace("–", "\u2060–\u2060")}${how}. ${tr(lang, "Vezmite si nepremokavú bundu.")}`;
}
