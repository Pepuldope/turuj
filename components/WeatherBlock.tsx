"use client";

import { useState } from "react";
import type { DayPlan } from "@/lib/dayPlan";
import { useCachedJson } from "@/lib/useDriveRoute";
import { FORECAST_DAYS } from "@/lib/weather";
import type { TripWeatherReport, WeatherForecast } from "@/lib/weather";
import type { LatLng } from "@/lib/types";
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

/** "Môže pršať 8:00–10:00 (mierne, do 0,8 mm/h). Vezmite si nepremokavú bundu." Also the warnings recap's line. The span never breaks at its dash (word joiners). */
export function wetText(wet: NonNullable<TripWeatherReport["wet"]>, lang: Lang): string {
  const how = wet.mmPerHour >= 0.1 ? tr(lang, " ({how}, do {mm} mm/h)", { how: tr(lang, wet.mmPerHour < 0.5 ? "slabo" : wet.mmPerHour < 2 ? "mierne" : "výdatne"), mm: decimal(lang, wet.mmPerHour) }) : "";
  return `${tr(lang, wet.snow ? "Môže snežiť" : wet.sleet ? "Môže pršať so snehom" : "Môže pršať")} ${wet.when.replace("–", "\u2060–\u2060")}${how}. ${tr(lang, "Vezmite si nepremokavú bundu.")}`;
}
