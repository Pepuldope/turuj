# Deploying to Cloudflare Workers (free plan)

Túruj runs on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`).
The free Workers plan allows commercial use (Vercel Hobby does not) and gives 100k requests/day.

## One-time setup (Cloudflare dashboard)

1. **Workers & Pages → Create → Import a repository.** Authorise the Cloudflare GitHub app for
   `Pepuldope/turuj` only, then pick the repo.
2. Build settings:

   | Field | Value |
   |---|---|
   | Project / Worker name | `turuj` (must match `name` in `wrangler.jsonc`) |
   | Production branch | `main` |
   | Build command | `npx opennextjs-cloudflare build` |
   | Deploy command | `npx opennextjs-cloudflare deploy` |
   | Non-production branch deploy command | `npx opennextjs-cloudflare upload` (preview link per branch/PR) |
   | Root directory | `/` |

3. **Variables** (Worker → Settings → Variables and Secrets, and the build's variables):

   | Name | Where | Why |
   |---|---|---|
   | `ORS_API_KEY` | Runtime, as a **Secret** | drive time + route (`/api/drive*`); without it the OSRM demo fallback is used |

   Trip data ships as static files (`public/data`) plus the D1 database; nothing else is needed.

4. The site appears at `https://turuj.<your-subdomain>.workers.dev`. A custom domain is added later
   under Worker → Settings → Domains & Routes.

## Local commands

```bash
npm run cf:build     # build the Worker bundle into .open-next/
npm run cf:preview   # build + run it locally in the Workers runtime (wrangler)
npm run cf:deploy    # build + deploy from your machine (needs `npx wrangler login`)
```

Local runtime secrets go in `.dev.vars` (git-ignored), e.g. `ORS_API_KEY=...`.

## Limits worth knowing

- Free plan: 100k requests/day, 10 ms CPU per request. Files in `public/` are served without the
  Worker. Drawing a Next.js page costs the Worker several times 10 ms, so no page is drawn per visit
  (error 1102 on 2026-10-13 and 2026-10-14): the home, info and trip pages are all built ahead
  and shipped as files, so even a trip's first visit after a deploy is quick (2026-10-15: drawn on
  the first visit, it took a second or two). Only pages the build can't know (the route
  comparison `/trasa/<slug>/cesty`, a trip newer than the build) are drawn on their first visit and
  kept in the free KV store `PAGE_CACHE` until the next deploy (`lib/pageCache.ts`,
  `open-next.config.ts`). The first deploy with that binding creates the KV store by itself. CI runs
  `scripts/check-page-cache.mjs` after the build and fails on a page that would be drawn per visit,
  uses `revalidate`, a trip page not built ahead, or more files than the free plan's 20,000.
- Free plan: at most 20,000 files per deploy (`public/`, the built pages and the code). Each route
  has a trip file and a built page, and each place one GPX file holding all its routes, so ~15,500
  files for 6,463 routes at 2,131 places (2026-10-17; a GPX per route had reached 19,812). The check
  warns over 19,000. Past the limit, build only the main routes ahead in `app/trasa/[slug]/page.tsx`.
- KV's free plan writes 1,000 entries a day. A deploy starts the cache fresh; past the limit, those
  pages are drawn per visit again until the next day.
- `@opennextjs/cloudflare` requires Next.js ≥ 16.3.8, so `next` is pinned there.

## Pulling a trip (safety switch)

If a trip must come down at once (a closure or a wrong route found), no data run is needed:

1. Edit `data/pulled-trips.json` and add the trip's address name, e.g. `["vrsatec-od-auta"]`
   (the part after `/trasa/`; every variant is its own name, so list each one to pull them all;
   nothing is matched by prefix). Empty list `[]` = nothing pulled.
2. Push to `main` (a pull request merged is enough). The Deploy workflow publishes it, **live in
   about 12 minutes**.
3. From then on `/trasa/<name>`, its `/okruh` and `/cesty` pages and the `/en/...` copies answer
   "Tento výlet je dočasne stiahnutý" with HTTP 503, `Retry-After`, `noindex`, and links to the
   home page and `/upozornenie` (`worker.ts` checks the list first, `lib/pulledTrips.ts`).
   503 and not 410: "gone" would make search engines forget the page for good.
4. The trip stays in the home and town lists, search and the sitemap until the next data run
   drops it there; to put it back, remove it from the file the same way.

## Safety nets

- **Deploy guard:** `deploy.yml` runs `npm run typecheck` and `npm test` in a `test` job first;
  `deploy` needs it, so a failing check stops the deploy (pushes, data-workflow runs and manual runs alike).
- **Previews refuse writes:** every API route that writes (reviews, feedback, sign-in and sign-up,
  push, visit and event counts) answers 403 `{"error":"preview"}` on a host that is not in
  `COUNTED_HOSTS` (`lib/site.ts`; `lib/previewGuard.ts`). Previews share the live database.
  Router-budget counting (`lib/orsBudget.ts`) still runs there: it counts real router calls.
- **Automatic checks** (a failed run e-mails the repo owner): `site-up.yml` every 30 minutes;
  `weekly-red-flags.yml` (train timetable under 3 weeks left, live build is not `main`);
  `tanap-check.yml` (opens an issue; its fetcher is still a TODO). None of them blocks the data runs.
