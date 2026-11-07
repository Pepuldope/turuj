# Search and visitor stats: setup

What the code does on its own, and the few things only you can click. Every tool here is free.
Settings that are not secret live in `lib/site.ts` (one line each). Secrets go only into the
Cloudflare dashboard, never into the repo (it is public).

## What is built

| Piece | Where | Needs setup? |
|---|---|---|
| Slovak titles, descriptions, canonical URLs, link previews | `lib/seo.ts`, each `page.tsx` | No |
| `sitemap.xml` (home, every trip, info pages) and `robots.txt` | `app/sitemap.ts`, `app/robots.ts` | No |
| Structured data (WebSite, Organization, TouristAttraction, breadcrumbs) | `components/JsonLd.tsx` | No |
| Brand icons and preview image | `app/icon.svg`, `app/apple-icon.png`, `public/og-image.png` | No |
| Privacy, disclaimer, sources pages + footer | `/sukromie`, `/upozornenie`, `/zdroje` | Optional contact e-mail |
| Umami visitor stats + product events | `components/Analytics.tsx`, `lib/analytics.ts` | **Step 1** |
| "People with 4+ visit days" counter + report at `/statistiky` | `app/api/visit`, `lib/visitStore.ts`, Cloudflare D1 | No |
| Google Search Console | outside the code | **Step 2**, after the domain |
| Tester sign-up and post-test feedback (Google Forms) | `TESTER_FORM_URL`, `FEEDBACK_FORM_URL` in `lib/site.ts`; footer link "Chcem testovať" | No. Radoslav sends the feedback link after each test |

The real address is `SITE_URL` in `lib/site.ts`. When turuj.sk is live, change that one line
to `https://turuj.sk` and add `turuj.sk` to Search Console; all canonical URLs, the sitemap
and link previews follow.

## Why two counters

Umami Cloud's free Hobby plan (100k events/month, 1 website, 6 months of history) gives the
dashboard: visitors, where they came from, which trips they opened, saves, shares and navigation
opens. It has **no API on the free plan**, so a script cannot read its numbers. The proposal KPI
"people who used Túruj on 4+ different days in a month" is therefore counted by our own small
Cloudflare D1 database (free, bound as `VISITS_DB` in `wrangler.jsonc`; the first deploy creates
it, no account, key or secret needed), with the same method Umami uses: a one-way hash of
IP + browser with a random key that changes every month. Nothing is stored on the visitor's
device, so no consent banner. When a month ends its key and raw rows are deleted and only the
totals stay. The count is conservative: someone whose phone changes IP address between days is
counted as two people with fewer days each.

**The monthly report:** open `/statistiky` on the live site (not linked, not indexed). One row
per month: people, people with 2+ days, people with **4+ days** (the KPI), average days. The
current month updates live. If the page says the counter only runs on the published site after a
deploy, check Cloudflare → **Workers & Pages** → **turuj** → **Bindings**: `VISITS_DB` should
be listed. If it is missing, the build had no permission to create the database: **Storage &
Databases** → **D1** → **Create** → name `mountour-visits`, then in the Worker → **Bindings** →
**Add binding** → **D1 database**, variable name `VISITS_DB`, database `mountour-visits` → **Save**.

## Events sent to Umami

| Event | When | Data |
|---|---|---|
The list lives in `lib/analytics.ts` (`AnalyticsEvent`). Events marked D1 are also added to
the site's own monthly totals (`/api/event`, `lib/eventCounts.ts`), which /statistiky and
`scripts/monthly_report.py` read; they must go through `track()`, not a `data-umami-event`
attribute, or the D1 total stays 0.

| Event | When | Data | D1 |
|---|---|---|---|
| `start_set` | a start is known: GPS, a typed place, or one remembered | `how` | yes |
| `trip_open` | a trip page is opened | `trail` (slug) | |
| `trip_saved` | "Uložiť výlet" tapped | `trail` | yes |
| `share` | "Poslať partii" tapped | `trail`, `took` | |
| `share_sent` | the share sheet sent it, or the text was copied | `trail`, `how`, `took` | yes |
| `shared_open` | a friend opened a shared plan link | `trail`, `expired` | yes |
| `gpx_download` | "Stiahnuť GPX trasu" tapped | `trail` | |
| `nav_open` | "Na parkovisko" / "Po trase" hand-off tapped | `app`: google, mapy, google-walk, mapy-walk | yes |
| `transit_open` | a timetable or transit-map link tapped (`data-umami-event`, Umami only) | `app` | |
| `tester_signup_open` | "Chcem testovať" footer link tapped (`data-umami-event`, Umami only) | none | |

Never send coordinates, typed places or anything personal.

---

## Step 1. Umami account (about 10 minutes)

1. Open https://cloud.umami.is/signup and create an account (Hobby plan, free, no card).
2. After logging in you are asked to add a website. If not: left menu **Settings** → **Websites** →
   **Add website**.
   - Name: `Túruj`
   - Domain: `mountour.nemcok-peter123.workers.dev`
   - Click **Save**.
3. In the website list click **Edit** next to Túruj. Copy the **Website ID** (a long code like
   `a1b2c3d4-...`).
4. Send that ID to Claude in the project thread, or put it in `lib/site.ts` yourself:
   on GitHub open `lib/site.ts` → pencil icon (**Edit this file**) → change
   `?? ""` on the `UMAMI_WEBSITE_ID` line to `?? "your-id"` → **Commit changes**.
5. Optional: Settings → Team → add Radoslav, so he sees the dashboard without your login.

After the next deploy, open the site, then Umami → **Websites** → Túruj: your visit shows up
within a minute.

## Step 2. Google Search Console (after turuj.sk is live)

1. https://search.google.com/search-console → **Add property** → **Domain** → `turuj.sk` →
   **Continue**.
2. Copy the TXT record Google shows. At the DNS provider (Cloudflare, if the domain is moved
   there) → **DNS** → **Add record** → Type `TXT`, Name `@`, Content = the copied text → **Save**.
   Back in Search Console click **Verify**.
3. Left menu **Sitemaps** → enter `sitemap.xml` → **Submit**.
4. **URL inspection** → paste the home page and 2-3 trip links → **Request indexing**.
5. **Settings** → **Users and permissions** → **Add user** → Radoslav, Full.
6. Optional: https://www.bing.com/webmasters → **Import from Google Search Console**.

Before the domain exists you can already test link previews: paste a trip link into Messenger or
WhatsApp, or use https://www.opengraph.xyz, and check structured data at
https://search.google.com/test/rich-results.

## Search Console report (`gsc-report.yml`)

`.github/workflows/gsc-report.yml` (monthly on the 2nd, or by hand) pulls Search Console data for
`sc-domain:turuj.sk` with `scripts/gsc_report.py`: queries, pages, daily totals, devices, countries,
sitemaps and URL Inspection on a sample. The repo is public, so the output is encrypted with `age`
to a public recipient key and only the `.age` artifact is uploaded (kept 3 days); logs and the job
summary hold counts only. On the Mac, `scripts/gsc-pull.sh <dir> [run-id]` downloads, decrypts with
`~/.config/turuj-gsc/key.txt` and deletes the artifact from GitHub. Needs the `GSC_SERVICE_ACCOUNT_JSON` secret.
