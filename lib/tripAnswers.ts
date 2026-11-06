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
  /** The latest start that still ends the walk before sunset with the buffer; null when the day is too short for the walk. */
  latest: Date | null;
  /** Who keeps the seasonal closure that covers the middle of this month; null when the trail is not closed then. A closed month never gets a time. */
  closedBy: string | null;
}

/** A fixed, non-leap year: the table must not change with the day it is built. */
const TABLE_YEAR = 2027;
const FIVE_MIN = 5 * 60000;

/**
 * Per month, the latest start so the walk ends SAFE_MARGIN_MIN (lib/dayPlan.ts) before sunset: the
 * 15th of the month, the sun where the trip is, Slovak clock time. Rounded down to 5 minutes. A month
 * whose 15th falls inside a yearly (seasonal) closure of the trip is "closed", with no time.
 */
export function monthTable(at: LatLng, walkMin: number, closures: Closure[] = []): MonthRow[] {
  const rows: MonthRow[] = [];
  const seasonal = closures.filter((c) => c.kind === "rocna");
  for (let month = 1; month <= 12; month++) {
    const date = `${TABLE_YEAR}-${String(month).padStart(2, "0")}-15`;
    const plan = planDay({ date, start: "06:00", driveMin: null, hikeMin: walkMin, location: at });
    if (!plan) continue;
    const closed = seasonal.filter((c) => isClosureActive(c, date));
    const latest = new Date(Math.floor(plan.latestStart.getTime() / FIVE_MIN) * FIVE_MIN);
    rows.push({
      month,
      sunset: plan.sunset,
      latest: closed.length === 0 && latest >= plan.sunrise ? latest : null,
      closedBy: closed.length ? [...new Set(closed.map(closureManager))].join(", ") : null,
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
 * The answer sentence. Without a closure: "V júni treba vyraziť …, v decembri …". With a seasonal closure
 * it never quotes a closed month: it speaks for the open months and names the closure.
 */
export function departureSentence(lang: Lang, rows: MonthRow[], closures: Closure[] = []): string {
  const open = rows.filter((r) => r.closedBy === null);
  const closed = rows.filter((r) => r.closedBy !== null);
  if (closed.length === 0) {
    const june = rows.find((r) => r.month === 6);
    const dec = rows.find((r) => r.month === 12);
    if (!june || !dec) return tr(lang, "Kedy vyraziť, závisí od západu slnka v daný mesiac.");
    return tr(lang, "V {m1} treba vyraziť {a}, v {m2} {b}.", { m1: monthIn(lang, 6), a: latestText(lang, june), m2: monthIn(lang, 12), b: latestText(lang, dec) });
  }
  const period = closures.filter((c) => c.kind === "rocna").map((c) => `${closurePeriod(c)}`).filter((p, i, all) => all.indexOf(p) === i).join("; ");
  const who = [...new Set(closed.map((r) => r.closedBy as string))].join(", ");
  const closedPart = tr(lang, "od {period} je trasa uzavretá ({who}).", { period, who });
  const times = open.filter((r) => r.latest).map((r) => r.latest as Date);
  if (open.length === 0) return tr(lang, "Trasa je uzavretá celý rok ({who}).", { who });
  if (times.length === 0) return tr(lang, "Mimo sezónnej uzávery ({months}) túru za svetla nestihnete; {closed}", { months: monthSpan(lang, open.map((r) => r.month)), closed: closedPart });
  const ordered = times.map((t) => clock(t)).sort();
  const lo = ordered[0];
  const hi = ordered[ordered.length - 1];
  return tr(lang, lo === hi ? "Mimo sezónnej uzávery ({months}) treba vyraziť najneskôr o {lo}; {closed}" : "Mimo sezónnej uzávery ({months}) treba vyraziť najneskôr medzi {lo} a {hi} podľa mesiaca; {closed}", {
    months: monthSpan(lang, open.map((r) => r.month)),
    lo,
    hi,
    closed: closedPart,
  });
}

/** Under the table: dated closures are not months, the closure section has them. */
export function hasDatedClosure(closures: Closure[]): boolean {
  return closures.some((c) => c.kind === "jednorazova");
}

/** The one-line assumption under the table. */
export function departureNote(lang: Lang, walkMin: number, bufferMin: number): string {
  return tr(lang, "Počítame s chôdzou {t} bez prestávok a rezervou {buffer} min pred západom slnka; 15. deň v mesiaci, slovenský čas.", { t: formatDuration(walkMin), buffer: bufferMin });
}
