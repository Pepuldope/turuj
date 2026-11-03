/**
 * Everything that leaves Túruj as a link or a message: the shared plan,
 * navigation hand-offs (Google Maps, Mapy.com) and the cp.sk timetable search.
 * Pure, so the wording and parameters are unit tested.
 */
import { DIFFICULTY_LABEL, formatDuration } from "@/lib/format";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { haversineM } from "@/lib/geo";
import type { LatLng } from "@/lib/types";
import type { StartPoint } from "@/lib/userLocation";
import { clockShort } from "@/lib/zoned";

/** The start as a town name for sharing; null for an unnamed GPS fix (we never share coordinates). */
export function startTown(start: Pick<StartPoint, "label" | "source"> | null, gpsTown?: string | null): string | null {
  if (!start) return null;
  if (start.source === "gps") return gpsTown ?? null;
  return start.label.split(",")[0].trim() || null;
}

const hhmm = clockShort;

/**
 * Query keys of a shared plan: /trasa/pajstun?den=2026-10-17&stretnutie=09:40&deti=1&p=1
 * Friends leave from different places, so the link carries the meeting time where the walk starts
 * (the parking, the stop, or the trail itself) and each friend's page works out their own departure.
 * Also the kids pace and the parking or stop picked (an index, 0 = ours, left out when 0; `cesta=bus`
 * says it is a stop). Links from before 2026-10-22 carry the sender's departure (`odchod`) and town (`z`).
 */
export const SHARE_PARAMS = { date: "den", meet: "stretnutie", time: "odchod", from: "z", travel: "cesta", kids: "deti", parking: "p", stop: "s" } as const;

export interface SharedPlan {
  date: string;
  /** When the walk starts, HH:MM: the meeting time at the parking or stop. */
  meet: string | null;
  /** An older link's departure from the sender's town (`meet` is then null). */
  time: string | null;
  /** The sender met at a stop (bus or train), not at a parking. */
  transit: boolean;
  withKids: boolean;
  /** Picked parking (by car) or stop (by bus or train); 0 = our default. */
  pick: number;
}

export function sharePath(slug: string, plan: Pick<SharedPlan, "date" | "transit" | "withKids" | "pick"> & { meet: string }, lang: Lang = "sk"): string {
  const q = new URLSearchParams({ [SHARE_PARAMS.date]: plan.date, [SHARE_PARAMS.meet]: plan.meet });
  if (plan.transit) q.set(SHARE_PARAMS.travel, "bus");
  if (plan.withKids) q.set(SHARE_PARAMS.kids, "1");
  if (plan.pick > 0) q.set(plan.transit ? SHARE_PARAMS.stop : SHARE_PARAMS.parking, String(plan.pick));
  return `${lang === "en" ? "/en" : ""}/trasa/${slug}?${q.toString()}`;
}

/** "2026-10-17", and a day the calendar has (not 2026-02-30). */
function realDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d;
}

/** "08:50", within a day. */
function realTime(time: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Reads a shared plan from a query string; null unless the day and a meeting time (or an older link's departure) are valid. */
export function readSharedPlan(search: string): SharedPlan | null {
  const q = new URLSearchParams(search);
  const date = q.get(SHARE_PARAMS.date) ?? "";
  const meet = q.get(SHARE_PARAMS.meet) ?? "";
  const time = q.get(SHARE_PARAMS.time) ?? "";
  if (!realDate(date)) return null;
  if (!realTime(meet) && !realTime(time)) return null;
  const transit = q.get(SHARE_PARAMS.travel) === "bus";
  const raw = Number(q.get(transit ? SHARE_PARAMS.stop : SHARE_PARAMS.parking) ?? 0);
  const pick = Number.isInteger(raw) && raw > 0 && raw < 100 ? raw : 0;
  return {
    date,
    meet: realTime(meet) ? meet : null,
    time: realTime(meet) ? null : time,
    transit,
    withKids: q.get(SHARE_PARAMS.kids) === "1",
    pick,
  };
}

export interface ShareTextInput {
  name: string;
  /** "sobota 17. 10." */
  dayLabel: string;
  withKids: boolean;
  /** When the walk starts: the meeting time. */
  meet: Date;
  /** Where: "na parkovisku", "na zastávke Píla"; null = at the trail (no ride, nothing to meet at). */
  place: string | null;
  /** Back where the walk started. */
  end: Date;
  /** Where the walk ends, matching `place`: by car "pri aute", by bus "na zastávke". */
  endPlace: "car" | "stop" | null;
  /** The hike ends before sunset. Otherwise the message warns instead of promising daylight. */
  inDaylight: boolean;
  hikeMin: number;
  difficulty: keyof typeof DIFFICULTY_LABEL;
  url: string;
}

/**
 * Chat-ready plan, one fact a line. Only times that hold for everyone: friends leave from
 * different places, so the message has the meeting time, not the sender's departure or home time.
 */
export function shareText(i: ShareTextInput, lang: Lang = "sk"): string {
  const t = (sk: string) => tr(lang, sk);
  const meet = i.place ? `${hhmm(i.meet)} ${t("stretnutie")} ${i.place}` : `${hhmm(i.meet)} ${t("začiatok túry")}`;
  const endWord = t(i.endPlace === "car" ? "späť pri aute" : i.endPlace === "stop" ? "späť na zastávke" : "koniec túry");
  const walk = tr(lang, "{t} chôdze, {level}", { t: formatDuration(i.hikeMin).replaceAll("\u00a0", " "), level: t(DIFFICULTY_LABEL[i.difficulty]).toLowerCase() });
  // Step by step, one fact a line (Peter, 2026-10-28: a plain "share trip" message for anyone).
  return [
    `${i.name} · ${i.dayLabel}${i.withKids ? t(" (s deťmi)") : ""}`,
    `• ${meet}`,
    `• ${walk}`,
    `• ${hhmm(i.end)} ${endWord}`,
    ...(i.inDaylight ? [] : [t("Pozor, z túry zídete až po západe slnka.")]),
    "",
    t("Celý plán je na Túruj, aj kedy vyraziť z tvojho miesta:"),
    i.url,
  ].join("\n");
}

/** "na parkovisku", or with its name when the parking has one ("na parkovisku Pod Kriváňom"). */
export function parkingPlace(name: string | null, lang: Lang = "sk"): string {
  const own = name && name.trim() !== "Parkovisko" ? name.replace(/^parkovisko\s+/i, "").trim() : "";
  if (lang === "en") return own ? `at the car park ${own}` : "at the car park";
  return own ? `na parkovisku ${own}` : "na parkovisku";
}

export function googleMapsUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lon}&travelmode=driving`;
}

/** The walk itself, as the trip page hands it to a maps app: [lat, lon] points of the trail. */
export interface WalkRoute {
  /** Way up only for "tam-a-spat" (back the same way); the whole loop for "okruh". */
  points: [number, number][];
  loop: boolean;
}

/**
 * `n` points spread evenly by distance along `pts`, ends excluded. Each lies on
 * the line between two trail points, so a short walk with few points still gets
 * `n` different stops (taking the next trail point repeated them, and a maps app
 * then went "there and back" to the same spot).
 */
function spread(pts: LatLng[], n: number): LatLng[] {
  if (pts.length < 2 || n <= 0) return [];
  const along = [0];
  for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + haversineM(pts[i - 1], pts[i]));
  const total = along[along.length - 1];
  if (total === 0) return [];
  const out: LatLng[] = [];
  let i = 0;
  for (let k = 1; k <= n; k++) {
    const want = (total * k) / (n + 1);
    while (i < pts.length - 2 && along[i + 1] < want) i++;
    const seg = along[i + 1] - along[i];
    const f = seg > 0 ? Math.min(1, Math.max(0, (want - along[i]) / seg)) : 0;
    const a = pts[i];
    const b = pts[i + 1];
    out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
  }
  return out;
}

/** The walk from where it joins the trail: parked up the trail, a there-and-back starts there and a loop is walked round from there. */
function walkedPart(walk: WalkRoute, join: LatLng | null): LatLng[] {
  const pts = walk.points.map(([lat, lon]) => ({ lat, lon }));
  if (!join || pts.length < 2) return pts;
  let at = 0;
  pts.forEach((p, i) => {
    if (haversineM(p, join) < haversineM(pts[at], join)) at = i;
  });
  return walk.loop ? [...pts.slice(at), ...pts.slice(1, at + 1)] : pts.slice(at);
}

/**
 * Points a maps app must pass so its walking route keeps to our trail: from the car
 * (or the stop) over the trail to the goal and, for loops, round to the start again.
 * There-and-back trails end at the goal (back the same way) unless `roundTrip`, which
 * repeats the way up in reverse so the app also routes the way back.
 */
export function walkStops(walk: WalkRoute, join: LatLng | null, max: number, roundTrip: boolean): { via: LatLng[]; end: LatLng | "start" } {
  const pts = walkedPart(walk, join);
  if (pts.length < 2) return { via: [], end: pts[0] ?? "start" };
  if (walk.loop) return { via: spread(pts, max), end: "start" };
  const goal = pts[pts.length - 1];
  if (!roundTrip) return { via: spread(pts, max), end: goal };
  const up = spread(pts, Math.floor((max - 1) / 2));
  return { via: [...up, goal, ...[...up].reverse()], end: "start" };
}

const g = (x: LatLng) => `${x.lat.toFixed(5)},${x.lon.toFixed(5)}`;
const m = (x: LatLng) => `${x.lon.toFixed(5)},${x.lat.toFixed(5)}`;

/**
 * Google Maps walking directions over the trail. Google opens a link on a phone with at
 * most 3 stops, so it gets 3 points to the goal and the app picks its own paths between them.
 */
export function googleWalkUrl(from: LatLng, walk: WalkRoute, join: LatLng | null): string {
  const { via, end } = walkStops(walk, join, 3, false);
  const dest = end === "start" ? from : end;
  const q = `&waypoints=${via.map(g).join("%7C")}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${g(from)}&destination=${g(dest)}${via.length ? q : ""}&travelmode=walking`;
}

/** Mapy.com hiking route (keeps to marked trails), up to 15 stops: the whole walk, back at the car. */
export function mapyWalkUrl(from: LatLng, walk: WalkRoute, join: LatLng | null): string {
  const { via, end } = walkStops(walk, join, 15, true);
  const dest = end === "start" ? from : end;
  const q = via.length ? `&waypoints=${via.map(m).join(";")}` : "";
  return `https://mapy.com/fnc/v1/route?mapset=outdoor&start=${m(from)}&end=${m(dest)}${q}&routeType=foot_hiking&navigate=true`;
}

/** Google Maps public transport directions; the app then lists the buses, trains and changes. */
export function googleTransitUrl(to: LatLng, from: LatLng | null): string {
  const origin = from ? `&origin=${from.lat},${from.lon}` : "";
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${to.lat},${to.lon}&travelmode=transit`;
}

/** Apple Maps public transport directions (dirflg=r); opens the Maps app on iPhone and Mac. */
export function appleTransitUrl(to: LatLng, from: LatLng | null): string {
  const saddr = from ? `saddr=${from.lat},${from.lon}&` : "";
  return `https://maps.apple.com/?${saddr}daddr=${to.lat},${to.lon}&dirflg=r`;
}

/** Mapy.com URL API (lon,lat order): a car route when the start is known, else the spot with a pin. */
export function mapyUrl(to: LatLng, from: LatLng | null): string {
  const p = (x: LatLng) => `${x.lon.toFixed(5)},${x.lat.toFixed(5)}`;
  return from
    ? `https://mapy.com/fnc/v1/route?mapset=outdoor&start=${p(from)}&end=${p(to)}&routeType=car_fast&navigate=true`
    : `https://mapy.com/fnc/v1/showmap?mapset=outdoor&center=${p(to)}&zoom=16&marker=true`;
}

/**
 * cp.sk (official SK train/bus search), prefilled with from, to, day and time.
 * `arrive`: the time is when you want to be there (cp.sk "príchod"), not when you leave.
 */
export function cpSkUrl(
  to: string,
  from: string | null,
  date: string | null,
  time: string | null,
  arrive = false
): string {
  const q = new URLSearchParams();
  if (from) q.set("f", from);
  q.set("t", to);
  if (date) {
    const [y, m, d] = date.split("-").map(Number);
    q.set("date", `${d}.${m}.${y}`);
  }
  if (time) q.set("time", time);
  if (arrive) q.set("arr", "true");
  return `https://cp.sk/vlakbusmhd/spojenie/?${q.toString()}`;
}

/** The way back: from the stop to home, leaving after you are off the trail. */
export function cpSkBackUrl(stop: string, home: string | null, date: string | null, after: string | null): string {
  const q = new URLSearchParams();
  q.set("f", stop);
  if (home) q.set("t", home);
  if (date) {
    const [y, m, d] = date.split("-").map(Number);
    q.set("date", `${d}.${m}.${y}`);
  }
  if (after) q.set("time", after);
  return `https://cp.sk/vlakbusmhd/spojenie/?${q.toString()}`;
}
