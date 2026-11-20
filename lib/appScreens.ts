import { langPath, tr } from "@/lib/lang";
import type { Lang } from "@/lib/lang";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

/** Phone screenshots of Túruj (public/screens, 780x1688 WebP, one set per language; see scripts/app-screens.cjs). */
export const APP_SCREENS = [
  {
    id: "home",
    caption: "Výlety podľa cesty z vášho štartu, s časom, kedy najneskôr vyraziť",
    alt: "Túruj na mobile: zoznam výletov z Popradu s časom, kedy vyraziť",
  },
  {
    id: "plan",
    caption: "Váš deň: cesta autom, túra, slnko a počasie po hodinách",
    alt: "Túruj na mobile: plán dňa pre Roklinu Suchá Belá s mapou, slnkom a počasím",
  },
  {
    id: "saved",
    caption: "Uložené výlety fungujú aj bez signálu",
    alt: "Túruj na mobile: uložený výlet v Mojich výletoch",
  },
] as const;

export const SCREEN_WIDTH = 780;
export const SCREEN_HEIGHT = 1688;

export const screenPath = (lang: Lang, id: string) => `/screens/${lang}-${id}.webp`;

/** schema.org WebApplication for Túruj; `path` is the page's Slovak path ("/" or "/aplikacia"). */
export function webApplicationLd(lang: Lang, path: string) {
  return {
    "@type": "WebApplication",
    "@id": `${SITE_URL}/#app`,
    name: SITE_NAME,
    url: absoluteUrl(langPath(lang, path)),
    applicationCategory: "TravelApplication",
    operatingSystem: "Any (web, iPhone, Android)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    inLanguage: lang,
    publisher: { "@id": `${SITE_URL}/#organization` },
    screenshot: APP_SCREENS.map((s) => ({
      "@type": "ImageObject",
      url: absoluteUrl(screenPath(lang, s.id)),
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
      caption: tr(lang, s.alt),
    })),
  };
}
