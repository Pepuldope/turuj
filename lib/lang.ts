import { EN } from "@/lib/en";

// The site speaks Slovak at its usual addresses and English under /en (the same
// pages, the same components). Text stays written in Slovak in the code; tr()
// looks the Slovak sentence up in lib/en.ts. Names of trips, places and towns are
// never translated. lib/en.test.ts fails when a wrapped sentence has no English.
// React parts (useT, LangLink, LangSwitch) are in lib/i18n.tsx.

export type Lang = "sk" | "en";
export type Vars = Record<string, string | number>;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** The sentence in the page's language; `{name}` places are filled from vars. */
export function tr(lang: Lang, sk: string, vars?: Vars): string {
  return fill(lang === "en" ? (EN[sk] ?? sk) : sk, vars);
}

/** "/trasa/x" in English is "/en/trasa/x"; outside links and anchors stay as they are. */
export function langPath(lang: Lang, path: string): string {
  if (lang === "sk" || !path.startsWith("/") || path.startsWith("/en/") || path === "/en" || path.startsWith("/api/") || path.startsWith("/data/")) return path;
  return path === "/" ? "/en" : path.startsWith("/?") || path.startsWith("/#") ? `/en${path.slice(1)}` : `/en${path}`;
}

/** The same page in Slovak: "/en/trasa/x" -> "/trasa/x". */
export function skPath(path: string): string {
  if (path === "/en") return "/";
  return path.startsWith("/en/") ? path.slice(3) : path;
}

export const langOfPath = (path: string | null | undefined): Lang => (path === "/en" || path?.startsWith("/en/") ? "en" : "sk");

/** Number with the language's decimal mark: "18,4" / "18.4". */
export function decimal(lang: Lang, n: number, digits = 1): string {
  const s = n.toFixed(digits);
  return lang === "en" ? s : s.replace(".", ",");
}

export const MONTH_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** In the browser: the language of the page open now (map code outside React reads it). */
export const pageLang = (): Lang => (typeof window === "undefined" ? "sk" : langOfPath(window.location.pathname));

/** A route's name from the data in the page's language: "Cez Sitno" -> "Via Sitno", "Okruh 2" -> "Loop 2". */
export function routeNameIn(lang: Lang, label: string): string {
  if (lang === "sk") return label;
  const via = /^Cez (.+)$/.exec(label);
  if (via) return tr(lang, "Cez {place}", { place: via[1] });
  const loop = /^Okruh (\d+)$/.exec(label);
  if (loop) return tr(lang, "Okruh {n}", { n: loop[1] });
  const other = /^Iná cesta (\d+)$/.exec(label);
  if (other) return tr(lang, "Iná cesta {n}", { n: other[1] });
  return tr(lang, label);
}

/** A region's name in the page's language: names of ranges stay, the catch-all "Ďalšie miesta na Slovensku" and the "a" between names are English. */
export function regionIn(lang: Lang, name: string): string {
  if (lang === "sk") return name;
  return name.startsWith("Ďalšie miesta") ? tr(lang, name) : name.replace(/ a /g, " and ");
}
