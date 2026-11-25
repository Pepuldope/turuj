/**
 * Finding the build files a page needs by reading its HTML and scripts, for the background offline copy.
 * Pure text work, no browser APIs.
 */

// A path ends at a quote, backslash (escaped JSON), whitespace, angle bracket or closing bracket; a "?dpl=..." query stays in.
const ASSET = /\/_next\/static\/[^"'\\\s<>)]+|(?<![A-Za-z0-9_/])static\/(?:chunks|css|media)\/[^"'\\\s<>)]+/g;

/** Every build file a text names, as /_next/static/... paths (with their query when they have one), once each, in order. */
export function assetNames(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(ASSET)) seen.add(m[0].startsWith("/") ? m[0] : `/_next/${m[0]}`);
  return [...seen];
}

/** The deployment query ("?dpl=...") the HTML's URLs carry, the most common one; "" when none has one. */
export function deployQuery(urls: string[]): string {
  const count = new Map<string, number>();
  for (const u of urls) {
    const i = u.indexOf("?");
    if (i >= 0) count.set(u.slice(i), (count.get(u.slice(i)) ?? 0) + 1);
  }
  let best = "";
  let most = 0;
  for (const [q, n] of count) {
    if (n > most) {
      best = q;
      most = n;
    }
  }
  return best;
}

/** Adds the query to a path that has none. */
export function withQuery(path: string, query: string): string {
  return path.includes("?") ? path : path + query;
}

/** The first GPX file address in a page's HTML, or null. */
export function gpxIn(html: string): string | null {
  return html.match(/\/gpx\/[^"'\\\s<>)/?]+\.gpx/)?.[0] ?? null;
}
