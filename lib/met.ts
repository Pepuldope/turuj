import type { WeatherForecast, WeatherStep } from "@/lib/weather";

// MET Norway Locationforecast 2.0 (CC BY 4.0), shared by /api/weather and the evening reminder.
// Their terms: identify the app in User-Agent, at most 4 decimals, cache, never call it from the browser.

export const MET_UA = "Turuj/1.0 https://github.com/Pepuldope/turuj nemcok.peter123@gmail.com";
/** MET answering slowly must not hold the page or the cron. */
export const MET_TIMEOUT_MS = 8000;

export interface MetStep {
  time: string;
  data: {
    instant: { details: { air_temperature?: number; wind_speed?: number } };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
  };
}

export function trimMetStep(s: MetStep): WeatherStep {
  const one = s.data.next_1_hours;
  const six = s.data.next_6_hours;
  const next = one ?? six;
  return {
    t: s.time,
    temp: s.data.instant.details.air_temperature ?? 0,
    wind: s.data.instant.details.wind_speed ?? 0,
    rain: next?.details?.precipitation_amount ?? 0,
    hours: one ? 1 : 6,
    symbol: next?.summary?.symbol_code ?? null,
  };
}

export function metUrl(lat: string, lon: string, alt: string): string {
  return "https://api.met.no/weatherapi/locationforecast/2.0/compact" + `?lat=${lat}&lon=${lon}${alt ? `&altitude=${alt}` : ""}`;
}

/** The forecast for a snapped place (lib/apiKeys weatherKey: 2 decimals); null when MET does not answer. Cached 30 min at the edge. */
export async function fetchForecast(lat: string, lon: string, alt: string): Promise<WeatherForecast | null> {
  try {
    const res = await fetch(metUrl(lat, lon, alt), {
      headers: { "User-Agent": MET_UA },
      signal: AbortSignal.timeout(MET_TIMEOUT_MS),
      cf: { cacheTtl: 1800, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    const data = await res.json();
    return { updated: data.properties?.meta?.updated_at ?? "", steps: ((data.properties?.timeseries ?? []) as MetStep[]).map(trimMetStep) };
  } catch {
    return null;
  }
}
