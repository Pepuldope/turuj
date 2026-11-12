import { skyKind, summarize, tripWeatherReport, weatherNotes, weatherWords } from "@/lib/weather";
import type { SkyKind, WeatherForecast } from "@/lib/weather";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { clockShort } from "@/lib/zoned";

export interface WeatherLine {
  /** fine: one quiet line; warn: advice box; danger: storms and other real danger. */
  tone: "fine" | "warn" | "danger";
  /** The line after the day word ("dážď so snehom do 10:00, na vrchole −4 °C"). */
  text: string;
  /** The sky for the quiet line's glyph (fine weather only). */
  sky: SkyKind | null;
}

const minus = (n: number) => String(n).replace("-", "−");
const hhmm = (clock: string) => clock.replace(/^(\d):/, "0$1:");

/**
 * The weather of the walk (not the whole day) as the one line above the plan's steps (Peter, 2026-11-12).
 * Built on the same report Kedy's weather box uses (lib/weather.ts), so both say the same thing.
 * Null when the forecast doesn't cover the walk.
 */
export function weatherLine(below: WeatherForecast, above: WeatherForecast | null, from: Date, to: Date, lang: Lang = "sk"): WeatherLine | null {
  const r = tripWeatherReport(below, above, from, to, { from, to }, lang);
  const sum = summarize(below, from, to);
  if (!r || !sum) return null;
  const notes = weatherNotes(below, above, from, to, lang);
  const storm = notes.find((n) => n.strong);
  // Storms and heavy rain already say what to do: the note's own sentence is the line.
  if (storm) return { tone: "danger", text: storm.text, sky: null };

  const parts: string[] = [];
  if (r.wet) {
    const what = tr(lang, r.wet.snow ? "sneženie" : r.wet.sleet ? "dážď so snehom" : "dážď");
    const [a, b] = r.wet.when.split("–").map(hhmm);
    // Rain from the walk's start reads "do 10:00", rain to its end "od 13:00".
    if (r.wet.when.split("–")[0] === clockShort(from)) parts.push(tr(lang, "{what} do {time}", { what, time: b }));
    else if (r.wet.when.split("–")[1] === clockShort(to)) parts.push(tr(lang, "{what} od {time}", { what, time: a }));
    else parts.push(tr(lang, "{what} {when}", { what, when: `${a}⁠–⁠${b}` }));
  }
  // Frost: up at the goal when it is clearly colder there, else down at the start (the "Mráz" note of weatherNotes).
  if (r.topMin !== null && r.topMin <= 0) parts.push(tr(lang, "na vrchole {t} °C", { t: minus(r.topMin) }).replace(" °C", " °C"));
  else if (r.tempMin <= 0) parts.push(tr(lang, "mráz, {t} °C", { t: minus(r.tempMin) }).replace(" °C", " °C"));
  if (parts.length > 0) return { tone: "warn", text: parts.join(", "), sky: null };

  const temps = (sum.tempMin === sum.tempMax ? `${minus(sum.tempMin)} °C` : tr(lang, "{a} až {b} °C", { a: minus(sum.tempMin), b: minus(sum.tempMax) })).replaceAll(" °C", " °C");
  return { tone: "fine", text: `${weatherWords(sum.symbol, lang)}, ${temps}`, sky: skyKind(sum.symbol) };
}
