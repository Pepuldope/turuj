import table from "@/data/slug-redirects.json";

/**
 * Old trip addresses that still lead somewhere (data/slug-redirects.json, written by the pipeline,
 * pipeline/redirects.py): a slug that was renamed, or a route that is no longer one. Chains are
 * followed; the caller checks that the answer is a live trip before redirecting, so a redirect
 * never leads to a 404.
 */
export function redirectTarget(slug: string, redirects: Record<string, string> = table.redirects): string | null {
  const seen = new Set([slug]);
  let t = redirects[slug];
  while (t && redirects[t] && !seen.has(t)) {
    seen.add(t);
    t = redirects[t];
  }
  return t && t !== slug ? t : null;
}
