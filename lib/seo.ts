import type { Metadata } from "next";
import { OG_IMAGE, SITE_NAME } from "@/lib/site";
import { langPath } from "@/lib/lang";
import type { Lang } from "@/lib/lang";

/**
 * Title, description, canonical URL and link-preview text for one page.
 * Child pages replace the root `openGraph` object as a whole, so the shared
 * fields are repeated here.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  image = OG_IMAGE,
  lang = "sk",
  english = true,
}: {
  title: string;
  description: string;
  path: string;
  /** true = use the title as is, without the " | Túruj" suffix. */
  absoluteTitle?: boolean;
  /** Link-preview picture; the brand image unless the page has its own (a trip's place photo). */
  image?: { url: string; width: number; height: number; alt: string };
  /** The page's language; `path` is always the Slovak address ("/o-nas"), the English one is under /en. */
  lang?: Lang;
  /** false = no English version offered to search engines (an English trip page not built ahead). */
  english?: boolean;
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    // Each language is its own page; hreflang tells search engines which one to show whom.
    alternates: {
      canonical: langPath(lang, path),
      ...(english ? { languages: { sk: path, en: langPath("en", path), "x-default": path } } : {}),
    },
    // An English page search engines aren't offered: people can open it, crawlers shouldn't list it.
    ...(!english && lang === "en" ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "website",
      locale: lang === "en" ? "en_GB" : "sk_SK",
      alternateLocale: lang === "en" ? "sk_SK" : "en_GB",
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: langPath(lang, path),
      images: [image],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image.url] },
  };
}
