// "Pridať do kalendára" (C89): one calendar event on the trip day with an alert at 19:00 the evening
// before. For everyone, and the way an iPhone outside the installed app gets its reminder.
// Times are written in UTC (no VTIMEZONE to get wrong); the alert is relative to the start, which both
// Apple Calendar and Google Calendar accept (an absolute alert is ignored by Google).
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { eveAtFor } from "@/lib/eve";

export interface IcsTrip {
  name: string;
  /** Full address of the trip page. */
  url: string;
  /** Trip day, YYYY-MM-DD. */
  date: string;
  /** Planned start and end, ms; null start: an all-day event. */
  startMs: number | null;
  endMs?: number | null;
  lang: Lang;
  /** Stable id: saving the same trip again replaces the event in most calendars. */
  uid: string;
  /** Time of writing, ms. */
  stampMs: number;
  /** Where the walk starts (parking, stop or trailhead name); falls back to the trip name. */
  location?: string | null;
  /** The same place on the map, when known. */
  geo?: { lat: number; lon: number } | null;
}

const enc = new TextEncoder();

/** Text values: backslash, semicolon, comma and line breaks escaped (RFC 5545 3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets continue on the next line after a space; never in the middle of a character. */
export function icsFold(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  // The first line may hold 75 octets, the continuation lines 74 (the leading space counts).
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit) {
      out.push(cur);
      cur = "";
      size = 0;
      limit = 74;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** 20261108T060000Z */
export function icsUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}

function icsDate(iso: string, plusDays = 0): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + plusDays));
  return `${t.getUTCFullYear()}${p2(t.getUTCMonth() + 1)}${p2(t.getUTCDate())}`;
}

/** Apple devices get a button named after the device; "iphone" covers iPad too (iPadOS asks for the desktop site as a Mac). */
export function appleKind(ua: string, touchPoints: number): "iphone" | "mac" | null {
  if (/iPhone|iPad|iPod/.test(ua)) return "iphone";
  if (/Macintosh|Mac OS X/.test(ua)) return touchPoints > 1 ? "iphone" : "mac";
  return null;
}

/** The trip's one-line description for a calendar: the link and the standing caveat. */
function detailsOf(trip: IcsTrip): string {
  return `${trip.url}\n${tr(trip.lang, "Časy sú odhad. Na horách rozhoduje počasie a vaše sily.")}`;
}

/** "Do Google Kalendára": the same event as a link that opens Google's add-event page (no file, no account setup). */
export function googleCalendarUrl(trip: IcsTrip): string {
  const timed = trip.startMs !== null;
  const dates = timed
    ? `${icsUtc(trip.startMs!)}/${icsUtc(trip.endMs && trip.endMs > trip.startMs! ? trip.endMs : trip.startMs! + 3600_000)}`
    : `${icsDate(trip.date)}/${icsDate(trip.date, 1)}`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: tr(trip.lang, "Výlet: {name}", { name: trip.name }),
    dates,
    details: detailsOf(trip),
    location: trip.location || trip.name,
  });
  // URLSearchParams writes spaces as "+"; Google reads %20 and "+" alike, but %20 is the safe one.
  return `https://calendar.google.com/calendar/render?${q.toString().replace(/\+/g, "%20")}`;
}

export function buildIcs(trip: IcsTrip): string {
  const eve = eveAtFor(trip.date);
  const timed = trip.startMs !== null;
  // Minutes before the start: from the real instants, so a clock change in between is right.
  // An all-day event starts at midnight, 5 hours after 19:00.
  const lead = timed ? (eve === null ? 300 : Math.max(1, Math.round((trip.startMs! - eve) / 60000))) : 300;
  const summary = tr(trip.lang, "Výlet: {name}", { name: trip.name });
  const description = detailsOf(trip);
  const when = timed
    ? [`DTSTART:${icsUtc(trip.startMs!)}`, `DTEND:${icsUtc(trip.endMs && trip.endMs > trip.startMs! ? trip.endMs : trip.startMs! + 3600_000)}`]
    : [`DTSTART;VALUE=DATE:${icsDate(trip.date)}`, `DTEND;VALUE=DATE:${icsDate(trip.date, 1)}`];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Turuj//turuj.sk//SK",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${trip.uid}`,
    `DTSTAMP:${icsUtc(trip.stampMs)}`,
    ...when,
    `SUMMARY:${icsEscape(summary)}`,
    `LOCATION:${icsEscape(trip.location || trip.name)}`,
    ...(trip.geo ? [`GEO:${trip.geo.lat.toFixed(4)};${trip.geo.lon.toFixed(4)}`] : []),
    `URL:${trip.url}`,
    `DESCRIPTION:${icsEscape(description)}`,
    ...(timed ? [] : ["TRANSP:TRANSPARENT"]),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(summary)}`,
    `TRIGGER:-PT${lead}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
