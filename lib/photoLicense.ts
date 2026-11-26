import type { PlacePhoto } from "@/lib/tripFiles";

/**
 * A link to the licence of a destination photo, for schema.org `license` (Google image metadata).
 * The licence text from Commons when the photo data has it; else built from the licence name (CC BY / BY-SA
 * with version and port, CC0, public domain = the Public Domain Mark page); else the photo's own file page,
 * which states the licence. Never empty, so Google never reports a missing `license` (Search Console 26 Nov 2026).
 */
export function photoLicenseUrl(photo: Pick<PlacePhoto, "license" | "license_url" | "page">): string {
  if (photo.license_url?.startsWith("http")) return photo.license_url;
  const name = photo.license?.trim() ?? "";
  const cc = /^CC (BY(?:-SA)?) (\d\.\d)(?: ([a-z]{2}))?$/i.exec(name);
  if (cc) return `https://creativecommons.org/licenses/${cc[1].toLowerCase()}/${cc[2]}/${cc[3] ? `${cc[3].toLowerCase()}/` : ""}`;
  if (/^CC0/i.test(name)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (/^public domain$/i.test(name)) return "https://creativecommons.org/publicdomain/mark/1.0/";
  return photo.page;
}
