/**
 * The question-shaped sections of a trip page ("Koľko trvá túra na X?", "Parkovanie", …): each opens
 * with ONE plain sentence made from the trip's own data, which is the line search and AI answers quote.
 * Pure functions, so the wording and the month table are unit tested. All of it is server HTML.
 */
import { approachMin, planDay } from "@/lib/dayPlan";
import { closureManager, closurePeriod, isClosureActive } from "@/lib/closures";
import { formatDuration, formatWalk, stopLabel } from "@/lib/format";
import { decimal, routeNameIn, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { directionTo } from "@/lib/slovakCase";
import { clock } from "@/lib/zoned";
import type { Closure, LatLng, ParkingLot, TransitStop } from "@/lib/types";
import type { DestinationKind, RouteBrief } from "@/lib/tripSchema";
import type { RouteWalk, WalkFacts } from "@/lib/walkFacts";
import { pickWalk } from "@/lib/walkFacts";
import { LOOP_SUFFIX } from "@/lib/loopRoute";

/** "na Babiu horu" for Slovak pages; English pages and names we are not sure of get null. */
export function hikeDirection(lang: Lang, name: string, kind: DestinationKind): string | null {
  return lang === "sk" ? directionTo(name, kind) : null;
}

/** Subtitle under the place name: "Túra na Babiu horu", else "Túra: Babia hora" ("Hike to X" in English). */
export function subtitle(lang: Lang, name: string, kind: DestinationKind): string {
  if (lang === "en") return tr(lang, "Túra: {name}", { name });
  const to = hikeDirection(lang, name, kind);
  return to ? tr(lang, "Túra {to}", { to }) : tr(lang, "Túra: {name}", { name });
}

/** Heading of the duration section: "Koľko trvá túra na Kriváň?", else "Koľko trvá túra: Kriváň?". */
export function howLongHeading(lang: Lang, name: string, kind: DestinationKind): string {
  const to = hikeDirection(lang, name, kind);
  if (lang === "en") return tr(lang, "Koľko trvá túra: {name}?", { name });
  return to ? tr(lang, "Koľko trvá túra {to}?", { to }) : tr(lang, "Koľko trvá túra: {name}?", { name });
}

const MONTHS_SK = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
/** After "v": "v júni". */
const MONTHS_SK_IN = ["januári", "februári", "marci", "apríli", "máji", "júni", "júli", "auguste", "septembri", "októbri", "novembri", "decembri"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const monthName = (lang: Lang, month: number) => (lang === "en" ? MONTHS_EN : MONTHS_SK)[month - 1];
const monthIn = (lang: Lang, month: number) => (lang === "en" ? MONTHS_EN : MONTHS_SK_IN)[month - 1];

/** One start of a place: the walk as its own page counts it (from the default parking or stop). */
export interface StartLine {
  slug: string;
  label: string;
  min: number;
  m: number;
  ascentM: number;
  /** The page being shown: listed without a link. */
  current: boolean;
}

/**
 * One line per start. Loops are walks of their own from a start already listed, so they are left out.
 * Two routes from one start are told apart by the route's label.
 */
export function startLines(
  lang: Lang,
  routes: RouteBrief[],
  walks: Record<string, RouteWalk>,
  current: { slug: string; startName: string; walk: WalkFacts | null; fallback: { min: number; m: number; ascentM: number } }
): StartLine[] {
  const own = (): StartLine => ({
    slug: current.slug,
    label: current.startName,
    min: current.walk?.min ?? current.fallback.min,
    m: current.walk?.m ?? current.fallback.m,
    ascentM: current.walk?.ascentM ?? current.fallback.ascentM,
    current: true,
  });
  const real = routes.filter((r) => !r.slug.endsWith(LOOP_SUFFIX));
  if (real.length < 2) return [own()];
  const counts = new Map<string, number>();
  for (const r of real) counts.set(r.start_name, (counts.get(r.start_name) ?? 0) + 1);
  return real.map((r) => {
    if (r.slug === current.slug) return { ...own(), label: label(r) };
    const w = pickWalk(walks[r.slug], false, r.parking);
    return { slug: r.slug, label: label(r), min: w?.min ?? r.duration_min, m: w?.m ?? r.distance_m, ascentM: w?.ascentM ?? r.ascent_m, current: false };
  });

  function label(r: RouteBrief): string {
    return (counts.get(r.start_name) ?? 0) > 1 && r.route_label ? `${r.start_name} (${routeNameIn(lang, r.route_label)})` : r.start_name;
  }
}

/** "Od 2 h 40 min do 5 h chôdze tam a späť podľa štartu." / "Túra trvá 3 h chôdze tam a späť." */
export function durationSentence(lang: Lang, lines: StartLine[], loop: boolean): string {
  const mins = lines.map((l) => l.min);
  const a = Math.min(...mins);
  const b = Math.max(...mins);
  if (lines.length > 1 && a !== b) {
    return tr(lang, loop ? "Od {a} do {b} chôdze okruhom podľa štartu." : "Od {a} do {b} chôdze tam a späť podľa štartu.", { a: formatDuration(a), b: formatDuration(b) });
  }
  return tr(lang, loop ? "Túra trvá {a} chôdze okruhom." : "Túra trvá {a} chôdze tam a späť.", { a: formatDuration(a) });
}

/** "Trangoška: 3 h 15 min chôdze, 9,4 km, +520 m" */
export function startLineText(lang: Lang, l: StartLine): string {
  return tr(lang, "{start}: {t} chôdze, {km} km, +{up} m", { start: l.label, t: formatDuration(l.min), km: decimal(lang, l.m / 1000), up: l.ascentM });
}

/** A pin on the map for coordinates, for people who navigate by it. */
export function pinUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
}

export const pinText = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;

/** Where to park, for the main start. No prices or capacity: we do not have them. */
export function parkingSentence(lang: Lang, startName: string, p: ParkingLot | null, hasStop: boolean): string {
  if (!p) {
    return tr(lang, hasStop ? "Pri štarte {start} sme nenašli parkovisko; ku štartu sa dostanete autobusom alebo vlakom." : "Pri štarte {start} sme nenašli parkovisko; navigácia vás dovedie na najbližšiu cestu, odtiaľ pešo.", { start: startName });
  }
  const m = p.join?.walk_m ?? p.walk_m;
  const walk = approachMin(m) > 0 ? tr(lang, "{m} pešo od trasy", { m: formatWalk(m, lang) }) : tr(lang, "priamo pri trase");
  const own = p.name && p.name.trim() !== "Parkovisko" ? p.name.replace(/^parkovisko\s+/i, "").trim() : "";
  return own
    ? tr(lang, "Pri štarte {start} zaparkujete na parkovisku {name}, {walk}.", { start: startName, name: own, walk })
    : tr(lang, "Pri štarte {start} zaparkujete na najbližšom parkovisku, {walk}.", { start: startName, walk });
}

/** "Parkovisko je podľa OpenStreetMap spoplatnené." only when the map says so; null when unknown. */
export function parkingFeeNote(lang: Lang, p: ParkingLot): string | null {
  if (p.fee === true) return tr(lang, "Podľa OpenStreetMap je parkovisko spoplatnené.");
  if (p.fee === false) return tr(lang, "Podľa OpenStreetMap je parkovisko zadarmo.");
  return null;
}

/** "Najbližšia {autobusová zastávka} je …": the stop's own kind. */
const MODE_WORD: Record<TransitStop["mode"], string> = {
  autobus: "autobusová zastávka",
  elektricka: "zastávka električky",
  vlak: "železničná stanica",
};

/** The nearest stop by walk to the trail; a neutral form when its kind is not known. */
export function transitSentence(lang: Lang, stops: TransitStop[]): string {
  if (stops.length === 0) return tr(lang, "Pri tejto trase sme nenašli blízku zastávku autobusu ani vlaku.");
  const s = stops[0];
  const m = s.join?.walk_m ?? s.distance_m;
  const walk = approachMin(m) > 0 ? tr(lang, "{m} pešo od trasy", { m: formatWalk(m, lang) }) : tr(lang, "priamo pri trase");
  const kind = MODE_WORD[s.mode];
  return kind
    ? tr(lang, "Najbližšia {kind} je {name}, {walk}.", { kind: tr(lang, kind), name: stopLabel(s.name), walk })
    : tr(lang, "Najbližšia zastávka verejnej dopravy: {name}, {walk}.", { name: stopLabel(s.name), walk });
}

/** Up to three other stops, nearest first; null when there are none. */
export function otherStops(lang: Lang, stops: TransitStop[]): string | null {
  const names = [...new Set(stops.slice(1).map((s) => stopLabel(s.name)).filter((n) => n !== stopLabel(stops[0].name)))].slice(0, 3);
  return names.length ? tr(lang, "Ďalšie zastávky pri trase: {names}.", { names: names.join("; ") }) : null;
}

/** The closure rule in one sentence; no rule at all is "Stav chodníka neoverený", never "open". */
export function closureSentence(lang: Lang, closures: Closure[]): string {
  if (closures.length === 0) return tr(lang, "Stav chodníka neoverený, pre túto trasu nemáme žiadne údaje o uzáverách.");
  const one = (c: Closure) => tr(lang, "od {period} ({who})", { period: closurePeriod(c), who: closureManager(c) });
  if (closures.length === 1) return tr(lang, "Na tejto trase platí uzávera {rule}.", { rule: one(closures[0]) });
  return tr(lang, "Na tejto trase platia uzávery: {rules}.", { rules: closures.map(one).join("; ") });
}

/** One row of the "when to leave at the latest" table. */
export interface MonthRow {
  month: number;
  sunset: Date;
  /** The latest start that still ends the walk before sunset with the buffer; null when the day is too short for the walk, or when any day of the month is closed. */
  latest: Date | null;
  /** Who keeps the closure when EVERY day of this month is closed; null otherwise. A closed month never gets a time. */
  closedBy: string | null;
  /** Some days of this month are closed: who, and which days ("16. 10.–31. 10."). Such a month never gets a time. */
  partial: { by: string; span: string } | null;
}

/** A fixed, non-leap year: the table must not change with the day it is built. */
const TABLE_YEAR = 2027;
const FIVE_MIN = 5 * 60000;
const DAY_MS = 86400000;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Dated (one-off) closures that are active now or still to come; with no `asOf`, all of them. */
export function relevantDated(closures: Closure[] = [], asOf?: string): Closure[] {
  return closures.filter((c) => c.kind === "jednorazova" && (!asOf || c.ends_on >= asOf));
}

/** The month/day keys (month*100+day) a dated closure covers within the 12 months from `asOf` (or from its own start). */
function datedDays(c: Closure, asOf?: string): Set<number> {
  const out = new Set<number>();
  const from = asOf && asOf > c.starts_on ? asOf : c.starts_on;
  let t = Date.parse(`${from}T00:00:00Z`);
  const end = Math.min(Date.parse(`${c.ends_on}T00:00:00Z`), t + 365 * DAY_MS);
  for (; t <= end; t += DAY_MS) {
    const d = new Date(t);
    out.add((d.getUTCMonth() + 1) * 100 + d.getUTCDate());
  }
  return out;
}

/**
 * Per month, the latest start so the walk ends SAFE_MARGIN_MIN (lib/dayPlan.ts) before sunset: the
 * 15th of the month, the sun where the trip is, Slovak clock time, rounded down to 5 minutes. EVERY day
 * of the month is checked against the yearly closures and the dated ones (active or coming within a year
 * of `asOf`, by month and day). A fully closed month has no time and a closedBy; a partly closed month has
 * no time either, only the closed span in `partial`.
 */
export function monthTable(at: LatLng, walkMin: number, closures: Closure[] = [], asOf?: string): MonthRow[] {
  const rows: MonthRow[] = [];
  const seasonal = closures.filter((c) => c.kind === "rocna");
  const dated = relevantDated(closures, asOf).map((c) => ({ c, days: datedDays(c, asOf) }));
  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, "0");
    const date = `${TABLE_YEAR}-${mm}-15`;
    const plan = planDay({ date, start: "06:00", driveMin: null, hikeMin: walkMin, location: at });
    if (!plan) continue;
    const closedDays: number[] = [];
    const who = new Set<string>();
    for (let day = 1; day <= DAYS_IN_MONTH[month - 1]; day++) {
      const iso = `${TABLE_YEAR}-${mm}-${String(day).padStart(2, "0")}`;
      const by = [...seasonal.filter((c) => isClosureActive(c, iso)), ...dated.filter((d) => d.days.has(month * 100 + day)).map((d) => d.c)].map(closureManager);
      if (by.length) {
        closedDays.push(day);
        by.forEach((w) => who.add(w));
      }
    }
    const by = [...who].join(", ");
    const full = closedDays.length === DAYS_IN_MONTH[month - 1];
    const runs: string[] = [];
    for (let i = 0; i < closedDays.length; ) {
      let j = i;
      while (j + 1 < closedDays.length && closedDays[j + 1] === closedDays[j] + 1) j++;
      runs.push(i === j ? `${closedDays[i]}. ${month}.` : `${closedDays[i]}. ${month}.–${closedDays[j]}. ${month}.`);
      i = j + 1;
    }
    const latest = new Date(Math.floor(plan.latestStart.getTime() / FIVE_MIN) * FIVE_MIN);
    rows.push({
      month,
      sunset: plan.sunset,
      latest: closedDays.length === 0 && latest >= plan.sunrise ? latest : null,
      closedBy: full ? by : null,
      partial: closedDays.length > 0 && !full ? { by, span: runs.join(", ") } : null,
    });
  }
  return rows;
}

/** "jún až október" for consecutive months, else the names in a list. */
function monthSpan(lang: Lang, months: number[]): string {
  const sorted = [...months].sort((a, b) => a - b);
  // Consecutive around the year's end too (Nov, Dec, Jan): rotate to start after the biggest gap.
  let start = 0;
  for (let i = 0; i < sorted.length; i++) if (((sorted[(i + 1) % sorted.length] - sorted[i] + 12) % 12) !== 1 && sorted.length > 1) start = (i + 1) % sorted.length;
  const rotated = [...sorted.slice(start), ...sorted.slice(0, start)];
  const consecutive = rotated.every((m, i) => i === 0 || (m - rotated[i - 1] + 12) % 12 === 1);
  const name = (m: number) => monthName(lang, m);
  if (consecutive && rotated.length > 2) return tr(lang, "{a} až {b}", { a: name(rotated[0]), b: name(rotated[rotated.length - 1]) });
  return rotated.map(name).join(", ");
}

/** "najneskôr o 17:05" or "túru za svetla nestihnete", for a month. */
function latestText(lang: Lang, row: MonthRow): string {
  return row.latest ? tr(lang, "najneskôr o {time}", { time: clock(row.latest) }) : tr(lang, "túru za svetla nestihnete");
}

/**
 * The answer sentence. Without a closure: "V júni treba vyraziť …, v decembri …". With a closure it never
 * quotes a time for a closed or partly closed month: it speaks for the untouched months and names the
 * closure. A dated closure (active or coming) opens the sentence with a warning.
 */
export function departureSentence(lang: Lang, rows: MonthRow[], closures: Closure[] = [], asOf?: string): string {
  const dated = relevantDated(closures, asOf);
  const warn = dated.length
    ? tr(lang, "Pozor, na trase je hlásená uzávera od {period}, pozrite časť Uzávery a poplatky.", { period: dated.map(closurePeriod).filter((p, i, all) => all.indexOf(p) === i).join("; ") }) + " "
    : "";
  const clear = rows.filter((r) => r.closedBy === null && r.partial === null);
  const closed = rows.filter((r) => r.closedBy !== null);
  if (clear.length === rows.length) {
    const june = rows.find((r) => r.month === 6);
    const dec = rows.find((r) => r.month === 12);
    if (!june || !dec) return warn + tr(lang, "Kedy vyraziť, závisí od západu slnka v daný mesiac.");
    return warn + tr(lang, warn ? "Mimo nej treba vyraziť: v {m1} {a}, v {m2} {b}." : "V {m1} treba vyraziť {a}, v {m2} {b}.", { m1: monthIn(lang, 6), a: latestText(lang, june), m2: monthIn(lang, 12), b: latestText(lang, dec) });
  }
  const seasonal = closures.filter((c) => c.kind === "rocna");
  const period = seasonal.map((c) => `${closurePeriod(c)}`).filter((p, i, all) => all.indexOf(p) === i).join("; ");
  const who = [...new Set(rows.flatMap((r) => (r.closedBy ?? r.partial?.by ?? "").split(", ")).filter(Boolean))].join(", ");
  const closedPart = seasonal.length ? " " + tr(lang, "od {period} je trasa uzavretá ({who}).", { period, who: [...new Set(seasonal.map(closureManager))].join(", ") }) : "";
  if (clear.length === 0) {
    if (closed.length === rows.length) {
      return seasonal.length && !dated.length ? tr(lang, "Trasa je uzavretá celý rok ({who}).", { who }) : warn + tr(lang, "Každý mesiac tabuľky je uzavretý ({who}); čas vyrazenia neuvádzame.", { who });
    }
    return warn + tr(lang, "Každý mesiac je aspoň sčasti uzavretý ({who}), preto čas vyrazenia neuvádzame; pozrite tabuľku.", { who }) + closedPart;
  }
  const timed = clear.filter((r) => r.latest);
  const untimed = clear.filter((r) => !r.latest);
  const outside = tr(lang, dated.length ? "Mimo uzávery" : "Mimo sezónnej uzávery");
  if (timed.length === 0) return warn + tr(lang, "{outside} ({months}) túru za svetla nestihnete", { outside, months: monthSpan(lang, untimed.map((r) => r.month)) }) + ".";
  const ordered = timed.map((r) => clock(r.latest as Date)).sort();
  const lo = ordered[0];
  const hi = ordered[ordered.length - 1];
  const months = monthSpan(lang, timed.map((r) => r.month));
  // The closure rule and its dates are in the closures row and the table, not repeated here.
  const lead = dated.length ? tr(lang, "{outside} ({months})", { outside, months }) : upFirst(months.replace(" až ", " – ").replace(" to ", " – "));
  let text = dated.length
    ? tr(lang, lo === hi ? "{lead} treba vyraziť najneskôr o {lo}" : "{lead} treba vyraziť najneskôr medzi {lo} a {hi} podľa mesiaca", { lead, lo, hi })
    : tr(lang, lo === hi ? "{lead}: najneskôr o {lo}" : "{lead}: najneskôr medzi {lo} a {hi} podľa mesiaca", { lead, lo, hi });
  if (untimed.length) text += ", " + tr(lang, "ale za svetla túru nestihnete ({months})", { months: monthSpan(lang, untimed.map((r) => r.month)) });
  return warn + text + ".";
}

/** Under the table: dated closures are not months, the closure section has them. */
export function hasDatedClosure(closures: Closure[]): boolean {
  return closures.some((c) => c.kind === "jednorazova");
}

/** The one-line assumption under the table. */
export function departureNote(lang: Lang, walkMin: number, bufferMin: number): string {
  return tr(lang, "Počítame s chôdzou {t} bez prestávok a rezervou {buffer} min pred západom slnka; 15. deň v mesiaci, slovenský čas.", { t: formatDuration(walkMin), buffer: bufferMin });
}

/** Months (November to March) whose row shows a time, i.e. is not closed: the walking times are summer values there. */
export function winterTimedMonths(rows: MonthRow[]): Set<number> {
  return new Set(rows.filter((r) => (r.month >= 11 || r.month <= 3) && !r.closedBy && !r.partial).map((r) => r.month));
}

/** The line under the table when any winter month is not closed. */
export function winterNote(lang: Lang): string {
  return tr(lang, "Časy platia pre letné podmienky. V zime (sneh, ľad, kratší deň) počítajte s dlhšou chôdzou a vyrazte skôr.");
}

// One-line answers shown under each question while its row is closed (and as the header facts). Pure
// functions of the same data as the sentences above. A closure teaser always states the yearly rule,
// never today's status (that is the client-side ClosureBanner), and never "open".

const upFirst = (s: string) => s.charAt(0).toLocaleUpperCase("sk") + s.slice(1);

/** "1. 11. do 31. 5." as "1. 11.–31. 5." */
const spanShort = (c: Closure) => closurePeriod(c).replace(" do ", "–");

/** "8 h 30 min zo štartu Liečebný dom Solisko"; several starts: "od 3 h do 4 h podľa štartu". */
export function durationTeaser(lang: Lang, lines: StartLine[]): string {
  const mins = lines.map((l) => l.min);
  const a = Math.min(...mins);
  const b = Math.max(...mins);
  if (lines.length > 1 && a !== b) return tr(lang, "od {a} do {b} podľa štartu", { a: formatDuration(a), b: formatDuration(b) });
  const own = lines.find((l) => l.current) ?? lines[0];
  return own ? tr(lang, "{t} zo štartu {start}", { t: formatDuration(own.min), start: own.label }) : "";
}

/** "Parkovisko pri štarte, spoplatnené"; no car park: "Bez parkoviska". */
export function parkingTeaser(lang: Lang, p: ParkingLot | null): string {
  if (!p) return upFirst(tr(lang, "bez parkoviska"));
  const near = (p.join ? p.join.walk_m : p.walk_m) < 150;
  const where = near ? tr(lang, p.join ? "parkovisko pri trase" : "parkovisko pri štarte") : tr(lang, p.join ? "parkovisko {m} od trasy" : "parkovisko {m} od štartu", { m: formatWalk(p.join?.walk_m ?? p.walk_m, lang) });
  const fee = p.fee === true ? tr(lang, "spoplatnené") : p.fee === false ? tr(lang, "zadarmo") : null;
  return upFirst([where, fee].filter(Boolean).join(", "));
}

const MODE_TEASER: Record<TransitStop["mode"], string> = { autobus: "Autobus", elektricka: "Električka", vlak: "Vlak" };

/** "Vlak: Štrbské Pleso, 504 m od štartu". */
export function transitTeaser(lang: Lang, stops: TransitStop[]): string {
  if (stops.length === 0) return tr(lang, "Zastávku sme nenašli");
  const s = stops[0];
  const m = s.join?.walk_m ?? s.distance_m;
  const mode = MODE_TEASER[s.mode];
  return tr(lang, "{mode}: {name}, {m} od štartu", { mode: mode ? tr(lang, mode) : tr(lang, "Zastávka"), name: stopLabel(s.name), m: formatWalk(m, lang) });
}

/** The yearly rule ("Zatvorené každý rok 1. 11.–31. 5. (TANAP)"); no rule at all is "Stav chodníka neoverený". */
export function closureTeaser(lang: Lang, closures: Closure[]): string {
  if (closures.length === 0) return tr(lang, "Stav chodníka neoverený");
  return closures
    .map((c) => tr(lang, c.kind === "jednorazova" ? "Uzávera {period} ({who})" : "Zatvorené každý rok {period} ({who})", { period: spanShort(c), who: closureManager(c) }))
    .join("; ");
}

/** "V júni najneskôr 11:45, v decembri 08:20"; null when the table has nothing plain to say. */
export function departureTeaser(lang: Lang, rows: MonthRow[]): string | null {
  const june = rows.find((r) => r.month === 6);
  const dec = rows.find((r) => r.month === 12);
  const part = (r: MonthRow | undefined, first: boolean) => (r?.latest && !r.closedBy && !r.partial ? `${first ? "" : tr(lang, "v {month}", { month: monthIn(lang, r.month) }) + " "}${clock(r.latest)}` : null);
  if (june?.latest && !june.closedBy && !june.partial) {
    const d = part(dec, false);
    return tr(lang, "V {month} najneskôr {time}", { month: monthIn(lang, 6), time: clock(june.latest) }) + (d ? `, ${d}` : "");
  }
  return tr(lang, "Podľa mesiaca, pozrite tabuľku");
}

/** The first sentence of the description that is not the numbers sentence (km, m, time: the header has them), cut to fit a one-line teaser. */
export function aboutTeaser(text: string, max = 110): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = sentences.find((x, i) => !(i === 0 && /\d.*\bkm\b/.test(x) && sentences.length > 1)) ?? text;
  return first.length > max ? first.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : first;
}

/** What the month table shows: a plain month, or one row for a run of fully closed months. */
export type MonthGroup = { kind: "month"; row: MonthRow } | { kind: "closed"; months: number[]; label: string; by: string };

/**
 * Calendar order, but consecutive fully closed months with the same keeper become ONE row ("november – máj").
 * A run that wraps the year end (Nov to May) sits where its first calendar month is (at the top).
 */
export function monthGroups(lang: Lang, rows: MonthRow[]): MonthGroup[] {
  const closedBy = new Map(rows.filter((r) => r.closedBy).map((r) => [r.month, r.closedBy as string]));
  const same = (a: number, b: number) => closedBy.has(a) && closedBy.get(a) === closedBy.get(b);
  const next = (m: number) => (m % 12) + 1;
  const prev = (m: number) => ((m + 10) % 12) + 1;
  const out: MonthGroup[] = [];
  const seen = new Set<number>();
  for (const r of rows) {
    if (seen.has(r.month)) continue;
    if (!closedBy.has(r.month)) {
      out.push({ kind: "month", row: r });
      continue;
    }
    // Walk back to the start of the run, then forward over it.
    let start = r.month;
    for (let i = 0; i < 12 && same(prev(start), start) && prev(start) !== r.month; i++) start = prev(start);
    const months = [start];
    while (same(months[months.length - 1], next(months[months.length - 1])) && next(months[months.length - 1]) !== start) months.push(next(months[months.length - 1]));
    months.forEach((m) => seen.add(m));
    const label = months.length === 1 ? monthName(lang, months[0]) : `${monthName(lang, months[0])} – ${monthName(lang, months[months.length - 1])}`;
    out.push({ kind: "closed", months, label, by: closedBy.get(r.month) as string });
  }
  return out;
}
