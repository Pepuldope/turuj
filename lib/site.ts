// Site-wide settings in one place. None of these are secrets (the repo is
// public and every value ends up in the page anyway), so they live in code.
// To change one, edit this file; each can also be overridden by an env var.

/**
 * The address search engines and link previews should treat as the real one.
 * The old workers.dev address redirects here (next.config.ts).
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://turuj.sk"
).replace(/\/+$/, "");

export const SITE_NAME = "Túruj";

/**
 * English trip pages built ahead (best known first). Each built page is a file, and the free plan
 * deploys at most 20,000 (scripts/check-page-cache.mjs); the rest are drawn on the first visit.
 */
export const EN_TRIPS_AHEAD = 1500;

// Planning ahead, not only for today (Peter 2026-10-29): "5 minút" is the pitch. Same words as the
// home h1 ("Kam na výlet?") so search engines read one topic.
export const SITE_TITLE = "Kam na výlet do hôr – jednodňová túra naplánovaná za 5 minút";

export const SITE_DESCRIPTION =
  "Výlety do hôr a prírody na Slovensku na jeden deň: koľko trvá cesta, kde zaparkovať, autobus či vlak a kedy najneskôr vyraziť, aby ste stihli návrat za svetla.";

/**
 * Umami Cloud website ID (Umami → Settings → Websites → Edit → Website ID).
 * Empty = no analytics script is loaded.
 */
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "da63a714-c5cf-412f-8194-a13cefc0d4f6";

/**
 * Hosts where visits are counted. Local dev and preview builds stay out of
 * the numbers.
 */
export const COUNTED_HOSTS = [
  new URL(SITE_URL).host,
  "turuj.sk",
  "www.turuj.sk",
  "mountour.nemcok-peter123.workers.dev",
  "turuj.nemcok-peter123.workers.dev",
  "mountour.vercel.app",
  "mountour.sk",
  "www.mountour.sk",
].filter((h, i, all) => all.indexOf(h) === i);

/** Public contact (Cloudflare Email Routing forwards it to Peter). */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@turuj.sk";


/** Link-preview image (1200x630) from the brand guide. */
export const OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Túruj – kam na výlet, aby ste boli späť za svetla",
};

/** The same picture with the English headline (public/og-image-en.png) for the /en pages. */
export const OG_IMAGE_EN = { ...OG_IMAGE, url: "/og-image-en.png", alt: "Túruj – where to go for a day trip, and be back before dark" };

export const REPO_URL = "https://github.com/Pepuldope/turuj";

/** Google Form for tester sign-up, linked from the footer ("Chcem testovať"). */
export const TESTER_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSernHNdz6_fbYBMZK7p41rZ7YuUmTmkDV1UTYDkOUfYe78IRg/viewform";

/** Google Form for 1-5 feedback after a test. Not on the site: Radoslav sends it after each test. */
export const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSf67uP7xbucQZ9dD68iF9OvPIBz75PR0y1_OORP9LCV9SsbkA/viewform";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
