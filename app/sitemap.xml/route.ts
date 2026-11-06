import { absoluteUrl } from "@/lib/site";
import { sitemapIndex } from "@/lib/sitemapGroups";

export const dynamic = "force-static";

/** GET /sitemap.xml: the index of the per-type sitemaps (app/sitemaps/sitemap.ts). */
export function GET() {
  return new Response(sitemapIndex(absoluteUrl), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
