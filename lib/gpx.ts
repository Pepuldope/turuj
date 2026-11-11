import type { LatLng } from "@/lib/types";

/**
 * Minimal GPX track-point parser — no dependency, just DOMParser. A place's file holds a track per
 * route (pipeline/publish.py), each with its trip's slug in <desc>: `track` picks one, else the
 * first (the main route) is used.
 */
export function parseGpxTrack(gpxText: string, track?: string): LatLng[] {
  const all = tracksOf(gpxText);
  return (track && all.bySlug.get(track)) || all.first;
}

function pointsOf(trk: Element | Document): LatLng[] {
  return Array.from(trk.getElementsByTagName("trkpt"))
    .map((pt) => ({ lat: parseFloat(pt.getAttribute("lat") ?? ""), lon: parseFloat(pt.getAttribute("lon") ?? "") }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

interface FileTracks {
  /** Each track by the slug in its <desc>. */
  bySlug: Map<string, LatLng[]>;
  /** The first track (the main route), or all points of a file with no track. */
  first: LatLng[];
}

// A place's file holds every route and is asked for once per route (the picked one, then each of the
// others): parsing it again for each cost ~70 ms on a route switch, so the last file is parsed once.
let lastText: string | null = null;
let lastTracks: FileTracks | null = null;

function tracksOf(gpxText: string): FileTracks {
  if (lastText === gpxText && lastTracks) return lastTracks;
  const doc = new DOMParser().parseFromString(gpxText, "application/xml");
  const trks = Array.from(doc.getElementsByTagName("trk"));
  const bySlug = new Map<string, LatLng[]>();
  for (const t of trks) {
    const slug = t.getElementsByTagName("desc")[0]?.textContent;
    if (slug && !bySlug.has(slug)) bySlug.set(slug, pointsOf(t));
  }
  lastTracks = { bySlug, first: pointsOf(trks[0] ?? doc) };
  lastText = gpxText;
  return lastTracks;
}

/**
 * The place's GPX cut down to one route: the track whose <desc> is `track`, else the first (the
 * main route). Null when the file can't be read. Every track in the file carries the place's name,
 * so `name` (the route as the page calls it) replaces it, and a maps app or watch shows which one it is.
 */
export function routeGpx(gpxText: string, track?: string, name?: string): string | null {
  const doc = new DOMParser().parseFromString(gpxText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const tracks = Array.from(doc.getElementsByTagName("trk"));
  if (tracks.length === 0) return null;
  const keep = (track && tracks.find((t) => t.getElementsByTagName("desc")[0]?.textContent === track)) || tracks[0];
  for (const t of tracks) if (t !== keep) t.parentNode?.removeChild(t);
  if (name) {
    const trkName = keep.getElementsByTagName("name")[0];
    const meta = doc.getElementsByTagName("metadata")[0]?.getElementsByTagName("name")[0];
    if (trkName) trkName.textContent = name;
    if (meta) meta.textContent = name;
  }
  return new XMLSerializer().serializeToString(doc);
}

/** One route's track, or [] when the file has no track for it (never another route's). */
export function parseGpxTrackExact(gpxText: string, track: string): LatLng[] {
  return tracksOf(gpxText).bySlug.get(track) ?? [];
}

const fileCache = new Map<string, Promise<string>>();

/** A place's GPX file as text, fetched once per page load; "" on any failure (not kept, so it can be retried). */
export function fetchGpxText(fileUrl: string): Promise<string> {
  let p = fileCache.get(fileUrl);
  if (!p) {
    p = fetch(fileUrl)
      .then((res) => (res.ok ? res.text() : ""))
      .catch(() => "");
    fileCache.set(fileUrl, p);
    p.then((text) => {
      if (!text) fileCache.delete(fileUrl);
    });
  }
  return p;
}

const trackCache = new Map<string, Promise<LatLng[]>>();

/** Fetches + parses a GPX track ("/gpx/<place>.gpx#<slug>") once per page load; resolves to [] on any failure. */
export function fetchTrack(gpxUrl: string): Promise<LatLng[]> {
  let p = trackCache.get(gpxUrl);
  if (!p) {
    // One download per place file, whichever of its routes is asked for.
    p = fetchGpxText(gpxUrl.split("#")[0])
      .then((text) => (text ? parseGpxTrack(text, decodeURIComponent(new URL(gpxUrl, "http://x").hash.slice(1))) : []))
      .catch(() => []);
    trackCache.set(gpxUrl, p);
    // Don't pin failures (offline / not cached yet): allow a retry next time.
    p.then((track) => {
      if (track.length === 0) trackCache.delete(gpxUrl);
    });
  }
  return p;
}

/** "/gpx/<file>" URL for a trail's gpx_path, or null. */
export function gpxUrlFor(gpxPath: string | null): string | null {
  return gpxPath ? `/gpx/${gpxPath.split("/").pop()}` : null;
}
