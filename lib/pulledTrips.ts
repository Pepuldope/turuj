// The switch to pull a trip (C135). data/pulled-trips.json lists trip slugs; worker.ts asks here
// before anything else, so a listed trip's pages answer a "taken down for now" notice even though
// the real pages are built ahead and would otherwise be served from the page cache.
//
// Matching is exact on the slug: /trasa/<slug> and its sub-pages (/okruh, /cesty), in Slovak and
// under /en. Variants of one trip are separate slugs (vrsatec-od-auta, vrsatec-cerveny-kamen), so
// pulling "all of Vršatec" means listing each of them; a shared prefix is never guessed at, so a
// typo can't take down unrelated trips.
//
// 503 with Retry-After, not 410: "gone" tells search engines to forget the page for good, and the
// trip is meant to come back. 503 means "temporarily unavailable"; noindex keeps the notice itself
// out of search results meanwhile.

const TRIP_PATH = /^(\/en)?\/trasa\/([^/]+)(\/(?:okruh|cesty))?\/?$/;

/** The pulled slug this path belongs to, or null. */
export function pulledSlug(pathname: string, slugs: readonly string[]): string | null {
  if (slugs.length === 0) return null;
  const m = TRIP_PATH.exec(pathname);
  if (!m) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(m[2]).toLowerCase();
  } catch {
    return null;
  }
  return slugs.includes(slug) ? slug : null;
}

const PAGE = {
  sk: {
    lang: "sk",
    title: "Tento výlet je dočasne stiahnutý",
    body: "Tento výlet sme dočasne stiahli, kým overíme údaje o ňom. Naplánujte si prosím iný výlet alebo sa vráťte neskôr.",
    home: "Späť na výlety",
    notice: "Upozornenie",
    homeHref: "/",
    noticeHref: "/upozornenie",
  },
  en: {
    lang: "en",
    title: "This trip is temporarily withdrawn",
    body: "We have taken this trip down for now while we check its details. Please plan another trip or come back later.",
    home: "Back to trips",
    notice: "Disclaimer",
    homeHref: "/en",
    noticeHref: "/en/upozornenie",
  },
} as const;

/** The notice page as plain, server-made HTML: no scripts, nothing that needs Next.js. */
export function pulledHtml(english: boolean): string {
  const p = english ? PAGE.en : PAGE.sk;
  return `<!DOCTYPE html><html lang="${p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${p.title} | Túruj</title><style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:15vh auto;padding:0 1.25rem;line-height:1.5;color:#1d2b24}a{color:#1c6b4a;font-weight:600}</style></head><body><main><h1>${p.title}</h1><p>${p.body}</p><p><a href="${p.homeHref}">${p.home}</a> · <a href="${p.noticeHref}">${p.notice}</a></p></main></body></html>`;
}

/** The notice answer for a pulled trip's page, or null when this request is not for one (GET and HEAD only). */
export function pulledResponse(req: Request, slugs: readonly string[]): Response | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const path = new URL(req.url).pathname;
  if (!pulledSlug(path, slugs)) return null;
  return new Response(req.method === "HEAD" ? null : pulledHtml(path.startsWith("/en/")), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
