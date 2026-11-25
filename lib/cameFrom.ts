// The pages a visitor went through in this tab, so every page's back link can name the page they
// came from and take them back to it (Peter, 25 Nov 2026, C219: after "Ďalšie výlety okolo X" or any
// other link off a trip page there was no way back to the trip being planned; the installed app has
// no back button of its own). Kept in sessionStorage by components/CameFrom.tsx; this file is the
// logic only.

export interface Visit {
  /** The page's pathname, language prefix included, no query string. */
  path: string;
  /** Pathname with its query string: where the back link points. */
  href: string;
  /** What the back link says: the trip's name, "Okolo Popradu", "Všetky výlety". */
  label: string;
}

/** An address on this site: one slash at the start, never "//other.site". */
const OWN = /^\/(?!\/)/;

/** Enough for a long browse; older pages fall off the bottom. */
const MAX = 30;

/** The same page in Slovak and in English is one page here. */
function bare(path: string): string {
  return path.replace(/^\/en(?=\/|$)/, "") || "/";
}

/**
 * The trail after arriving at `here`. `back` says the visitor got here by going back or forward in
 * the browser's history (or by our own back link): then the trail is cut back to that page instead of
 * growing, so A → B → back to A leaves A with the back link it had before.
 */
export function arrive(trail: readonly Visit[], here: Visit, back: boolean): Visit[] {
  const top = trail[trail.length - 1];
  // A reload, a changed query string or the language switch: still the same page.
  if (top && bare(top.path) === bare(here.path)) return [...trail.slice(0, -1), here];
  if (back) {
    for (let i = trail.length - 2; i >= 0; i--) {
      if (trail[i].path === here.path) return [...trail.slice(0, i), here];
    }
  }
  return [...trail, here].slice(-MAX);
}

/** The page the visitor came from; null when this page is not the trail's last one or it is the first. */
export function cameFrom(trail: readonly Visit[], path: string): Visit | null {
  const top = trail[trail.length - 1];
  if (!top || top.path !== path) return null;
  return trail[trail.length - 2] ?? null;
}

/** The trips on the trail (their slugs): the trip pages a back link can still lead to. */
export function tripsOn(trail: readonly Visit[]): string[] {
  return trail.flatMap((v) => {
    const slug = /^\/trasa\/([^/]+)$/.exec(bare(v.path))?.[1];
    return slug ? [slug] : [];
  });
}

/** What is stored, read back safely: anything odd is an empty trail. */
export function readTrail(raw: string | null): Visit[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (v): v is Visit => !!v && typeof v.path === "string" && OWN.test(v.path) && typeof v.href === "string" && OWN.test(v.href) && typeof v.label === "string" && v.label !== ""
    );
  } catch {
    return [];
  }
}
