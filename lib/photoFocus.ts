import { safeName } from "./photoName";

/**
 * Where to crop a few tall (portrait) photos that a wide frame cuts badly when centred (Peter, 18 Nov: castle
 * roofs cut off). The height, in per cent of the photo, that the crop leans towards (CSS object-position y);
 * photos not listed stay centred. Keyed by the Wikimedia Commons file name as it appears in the image URL
 * (thumbnails and originals both carry it; self-hosted copies carry it safeName()d). Add a photo here when a header shows the wrong part of it.
 */
const FOCUS_Y: Record<string, number> = {
  // Nový zámok, Banská Štiavnica: the cupola and the roof, not the house below.
  "Bansk%C3%A1_%C5%A0tiavnica_-_Nov%C3%BD_z%C3%A1mok1.jpg": 28,
  // Hrušov: the ruin in the upper half.
  "Hrussocivertanlegi2.jpg": 35,
  // Sučiansky hrad: the signpost with the castle's name.
  "Su%C4%8Diansky_hrad_SKT.jpg": 35,
};

/** The object-position for a photo's crop, or undefined to keep it centred. */
export function photoFocus(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  for (const [file, y] of Object.entries(FOCUS_Y)) if (url.includes(`/${file}`) || url.includes(`px-${file}`) || url.includes(`-${safeName(file)}-`)) return `50% ${y}%`;
  return undefined;
}
