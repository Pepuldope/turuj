// The evening-before reminder (C89): one push at 19:00 the evening before the trip day. What it says is
// worked out when it is sent (fresh forecast), from the small job the page left with the plan.
// Closure data is safety data: the message never says a trail is open. A known closure is stated with
// its end date; with no data the closure line is left out (the trip page says "Stav chodníka neoverený").
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { skyKind, summarize, tripWeatherReport, weatherNotes } from "@/lib/weather";
import type { WeatherForecast } from "@/lib/weather";
import { clockShort, wallClock, zonedDate } from "@/lib/zoned";
import type { Message } from "@/lib/pushPlan";

/** The reminder comes at this Slovak clock hour the evening before. */
export const EVE_HOUR = 19;
/** Planned at most this far ahead (the forecast reaches about 9 days). */
export const EVE_MAX_AHEAD_MS = 8 * 24 * 3600_000;

/** What the page leaves for the cron. Numbers only, and the public place of the trailhead. */
export interface EveJob {
  name: string;
  slug: string;
  lang: Lang;
  /** Trailhead or parking, where the forecast is asked. */
  lat: number;
  lon: number;
  /** The walk, ms since epoch. */
  from: number;
  to: number;
  /** Latest departure that is still safe, ms; null when the plan has none. */
  leave: number | null;
  /** End dates (YYYY-MM-DD) of the closure rules that cover the trip day. */
  closedUntil: string[];
}

/** 19:00 the evening before an ISO day, as ms; null for a bad date. */
export function eveAtFor(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return zonedDate(Number(m[1]), Number(m[2]), Number(m[3]) - 1, EVE_HOUR, 0).getTime();
}

/** Can the evening reminder still be sent for this day? Not on the day itself, not past 19:00 the day before, not beyond the horizon. */
export function eveWanted(date: string, now = Date.now()): number | null {
  const at = eveAtFor(date);
  return at !== null && at > now && at < now + EVE_MAX_AHEAD_MS ? at : null;
}

function dateWords(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

/** The title and the one-to-four short lines. `forecast` null: MET did not answer, the weather line is left out. */
export function eveMessage(job: EveJob, forecast: WeatherForecast | null): Message {
  const lang = job.lang;
  const from = new Date(job.from);
  const to = new Date(job.to);
  const lines: string[] = [];

  const report = forecast ? tripWeatherReport(forecast, null, from, to, undefined, lang) : null;
  if (forecast && report) {
    const temp = report.tempMin === report.tempMax ? `${report.tempMax}` : tr(lang, "{a} až {b}", { a: report.tempMin, b: report.tempMax });
    const worst = report.worst.charAt(0).toUpperCase() + report.worst.slice(1);
    let line = `${worst}, ${temp} °C`;
    const storm = forecast.steps.find((s) => {
      const t = new Date(s.t).getTime();
      return t < job.to && t + s.hours * 3600_000 > job.from && s.symbol?.includes("thunder");
    });
    if (storm) line += tr(lang, ", búrky okolo {time}", { time: clockShort(Math.max(job.from, new Date(storm.t).getTime())) });
    lines.push(line + ".");
  }

  if (job.leave !== null) lines.push(tr(lang, "Vyrazte najneskôr o {time}.", { time: clockShort(job.leave) }));

  if (job.closedUntil.length > 0) {
    const until = [...job.closedUntil].sort().at(-1)!;
    lines.push(tr(lang, "Pozor: trasa je zatvorená do {date}.", { date: dateWords(until) }));
  }

  if (forecast && report) {
    const summary = summarize(forecast, from, to);
    const kind = summary ? skyKind(summary.symbol) : null;
    if (kind === "thunder" || kind === "heavyrain" || weatherNotes(forecast, null, from, to, lang).some((n) => n.strong))
      lines.push(tr(lang, "Ak bude pršať, pozrite si iný výlet v okolí."));
  }

  if (lines.length === 0) lines.push(tr(lang, "Pozrite si plán a počasie na stránke výletu."));
  return {
    title: tr(lang, "Zajtra: {name}", { name: job.name }),
    body: lines.join(" "),
    url: `${lang === "en" ? "/en" : ""}/trasa/${encodeURIComponent(job.slug)}`,
    tag: `turuj-${job.slug}-eve`,
  };
}

/** Which Slovak date a ms instant falls on, "YYYY-MM-DD". */
export function isoDayOf(at: number): string {
  const w = wallClock(at);
  return `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

/** Closure end dates that cover a day. `closures` is the trip's rule list. */
export function closedUntilFor(date: string, closures: { starts_on: string; ends_on: string }[]): string[] {
  return closures.filter((c) => c.starts_on <= date && date <= c.ends_on).map((c) => c.ends_on);
}
