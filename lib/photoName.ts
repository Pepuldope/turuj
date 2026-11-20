/**
 * Local copies of Commons photos (scripts/fetch-photos.mjs, CI only): the file name part of a path
 * under public/photos/c/. The script holds its own copy of safeName (plain Node, no TS import);
 * lib/photoName.test.ts keeps the two equal.
 */

/** A Commons file name as it appears in a thumbnail URL (still percent-encoded), made safe for a file name. */
export function safeName(commonsFileName: string): string {
  return commonsFileName.replace(/[^A-Za-z0-9._-]/g, "_");
}

/** A Commons thumbnail URL: [1] = the URL up to the size step, [2] = the thumbnail's file name. Same as shareImage(). */
export const COMMONS_THUMB = /^(https:\/\/(?:thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/)\d+px-([^/]+)$/;

/** The size-less parts of a Commons thumbnail URL, or null for any other URL. */
export function parseCommonsThumb(url: string): { dir: string; file: string } | null {
  const m = COMMONS_THUMB.exec(url);
  return m ? { dir: m[1], file: m[2] } : null;
}
