// The Worker's front door (wrangler.jsonc "main"), plus a cron job: every 5 minutes (wrangler.jsonc
// "triggers") it sends the walk reminders that fall due (lib/pushPlan.ts).
// Pages built ahead (home, every trip and town
// page, the info pages) are answered here straight from the deploy's page cache, without
// starting Next.js; everything else goes to the OpenNext Worker as before.
//
// Why (load test on turuj.sk, 2026-10-29): about 1 in 8 answers was Cloudflare's "Worker exceeded
// resource limits" (error 1102). The free plan allows 10 ms of CPU per request; a ready trip page
// still cost ~12 ms through Next.js, and a freshly started Worker spent ~580 ms loading Next.js on
// its first request, whatever was asked. Here a page is one file read and a JSON parse.
//
// Only plain page loads and full page data (a tap on a link) take this path; prefetches of single
// parts (Next-Router-Segment-Prefetch), other methods, query strings and old addresses that
// redirect still go through Next.js. The weather every trip page asks for comes back from
// the edge cache the same way when it is kept there, and the review totals and trip lists are
// worked out here too (DATA_ROUTES). scripts/fast-pages.mjs writes
// the table of pages at build time.

// Both files exist only after a build, so the type check (run before it in CI) may or may not see them.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: written by opennextjs-cloudflare build
import openNext from "./.open-next/worker.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: written by scripts/fast-pages.mjs
import fast from "./.open-next/fast-pages.mjs";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: written by opennextjs-cloudflare build
import { runWithCloudflareRequestContext } from "./.open-next/cloudflare/init.js";
import { GET as reviewTotals } from "./app/api/review/route";
import { GET as tripList } from "./app/api/vylety/route";
import { weatherKey } from "./lib/apiKeys";
import type { D1Like } from "./lib/d1";
import { edgeHit, edgeKey } from "./lib/edgeCache";
import { pick } from "./lib/pageEntry";
import { sendDue } from "./lib/pushPlan";
import { fromOtherSite } from "./lib/routeGuard";

interface Env {
  ASSETS: { fetch(req: Request | string): Promise<Response> };
  VISITS_DB?: D1Like;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

// The Workers runtime's streaming HTML editor (no type package for it here).
declare class HTMLRewriter {
  on(selector: string, handlers: { element(el: { setAttribute(name: string, value: string): void }): void }): HTMLRewriter;
  transform(res: Response): Response;
}

/**
 * English pages share the root layout, which says lang="sk"; the browser fixes it with a script,
 * but search engines read the HTML as sent (Ahrefs 2 Nov: 1,880 hreflang/lang mismatches). So the
 * Worker says "en" in the HTML itself.
 */
const isEnglish = (path: string) => path === "/en" || path.startsWith("/en/");
const SK_HTML = '<html lang="sk"';

interface FastPages {
  buildId: string;
  routes: [string, string][];
  headers: [string, [string, string][]][];
  redirectHosts: string[];
}


const table = fast as FastPages;
const routes = table.routes.map(([re, dir]) => [new RegExp(re), dir] as const);
const pageHeaders = table.headers.map(([re, hs]) => [new RegExp(re), hs] as const);
const VARY = "RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url";

/** The page's file in the deploy's page cache, or null when this request isn't one for the fast path. */
function pageFile(req: Request, url: URL): string | null {
  if (req.method !== "GET") return null;
  if (table.redirectHosts.includes(url.hostname)) return null;
  // Only the data Next.js adds for its own navigation (?_rsc=...); any other query goes to Next.js.
  const query = [...url.searchParams.keys()];
  if (query.some((k) => k !== "_rsc")) return null;
  if (req.headers.has("Next-Router-Segment-Prefetch") || req.headers.has("Next-Router-Prefetch")) return null;
  const path = url.pathname;
  if (path !== "/" && path.endsWith("/")) return null;
  const route = routes.find(([re]) => re.test(path));
  if (!route) return null;
  let name: string;
  try {
    name = decodeURIComponent(path === "/" ? "/index" : path);
  } catch {
    return null;
  }
  return `http://assets.local/cdn-cgi/_next_cache/${table.buildId}/route-cache/APP_PAGE/${route[1]}/$${name}.cache`;
}

async function fastPage(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url);
  const file = pageFile(req, url);
  if (!file) return null;
  const res = await env.ASSETS.fetch(file);
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  const rsc = req.headers.get("RSC") === "1";
  const entry = pick(await res.text(), rsc ? "rsc" : "html");
  let body = rsc ? entry.rsc : entry.html;
  if (entry.type !== "app" || (entry.meta?.status ?? 200) !== 200 || typeof body !== "string") return null;
  if (!rsc && isEnglish(url.pathname)) body = body.replace(SK_HTML, '<html lang="en"');
  const headers = new Headers({ "Content-Type": rsc ? "text/x-component" : "text/html; charset=utf-8", Vary: VARY });
  for (const [re, hs] of pageHeaders) if (re.test(url.pathname)) for (const [k, v] of hs) headers.set(k, v);
  const stale = entry.meta?.headers?.["x-nextjs-stale-time"];
  if (stale) headers.set("x-nextjs-stale-time", stale);
  headers.set("x-turuj-fast", "1");
  return new Response(body, { headers });
}

/**
 * Two read-only data answers every visit asks for, run here without Next.js: the review totals
 * on each trip page and a town's trip list. Plain functions of the request and the database
 * (the 29 Oct preview test: with pages fast, these were the answers still hitting error 1102).
 */
const DATA_ROUTES: Record<string, (req: Request) => Promise<Response>> = {
  "/api/review": reviewTotals,
  "/api/vylety": tripList,
};

/** Every trip page asks for the weather; a kept answer goes back without Next.js, a miss goes to the route. */
const KEPT_ANSWERS: Record<string, (q: URLSearchParams) => Record<string, string> | null> = {
  "/api/weather": weatherKey,
};

async function keptAnswer(req: Request): Promise<Response | null> {
  if (req.method !== "GET" || fromOtherSite(req)) return null;
  const url = new URL(req.url);
  const params = KEPT_ANSWERS[url.pathname]?.(url.searchParams);
  return params ? edgeHit(edgeKey(req, params)) : null;
}

const worker = {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    try {
      const page = (await fastPage(req, env)) ?? (await keptAnswer(req));
      if (page) return page;
    } catch (err) {
      // Anything odd in the fast path: Next.js answers as before.
      console.warn("[fast] fell back to Next.js:", err);
    }
    const route = req.method === "GET" ? DATA_ROUTES[new URL(req.url).pathname] : undefined;
    if (route) return runWithCloudflareRequestContext(req, env, ctx, () => route(req));
    const res: Response = await openNext.fetch(req, env, ctx);
    if (!isEnglish(new URL(req.url).pathname) || !res.headers.get("Content-Type")?.startsWith("text/html")) return res;
    return new HTMLRewriter().on("html", { element: (el) => el.setAttribute("lang", "en") }).transform(res);
  },
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    if (!env.VISITS_DB) return;
    ctx.waitUntil(
      sendDue(env.VISITS_DB).then(
        (r) => r.sent + r.dropped > 0 && console.log(`[push] sent ${r.sent}, dropped ${r.dropped}`),
        (err) => console.warn("[push] cron failed:", err)
      )
    );
  },
};

export default worker;
