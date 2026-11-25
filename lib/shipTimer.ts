import { CONTACT_EMAIL } from "@/lib/site";

// Starts the "Ship batch" GitHub workflow (.github/workflows/ship-batch.yml) at 06:30 Slovak time.
// worker.ts calls shipTimer() from its 5-minute Cloudflare cron.
//
// Why here and not GitHub's own timer: GitHub starts this repository's timed jobs hours late or not
// at all (25 Nov 2026: neither morning slot of Ship batch ran; "Site up check", set to every 30
// minutes, ran 1-4 times a day). Cloudflare's cron runs to the minute.
//
// This only starts the workflow. The workflow decides what happens: with no open pull request
// labelled "ship-next-morning" its run ends in a few seconds and changes nothing.
//
// Needs the Cloudflare secret SHIP_BATCH_TOKEN: a fine-grained GitHub token for this repository
// only, with the one permission "Actions: read and write" (steps in docs/DEPLOY-CLOUDFLARE.md).
// Without the secret nothing happens. When GitHub refuses the start, one e-mail goes to the contact
// address through Resend (RESEND_API_KEY), so a dead token is noticed the same morning.

const REPO = "Pepuldope/turuj";
const WORKFLOW = "ship-batch.yml";
const SHIP_HOUR = 6;
const SHIP_MINUTE = 30;
const TRIES = 3;
const FROM = "Túruj <prihlasenie@turuj.sk>";

type Fetch = typeof fetch;

export interface ShipEnv {
  SHIP_BATCH_TOKEN?: string;
  RESEND_API_KEY?: string;
}

export type ShipStart = { ok: true } | { ok: false; status: number; detail: string };

/** True for the one 5-minute cron run that covers 06:30 in Slovakia, in winter and in summer time. */
export function isShipTime(at: number): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bratislava",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour === SHIP_HOUR && minute >= SHIP_MINUTE && minute < SHIP_MINUTE + 5;
}

/**
 * Asks GitHub to run the workflow for real (not as a dry run). A network error, a 5xx or a 429 is
 * tried again; any other refusal (bad or expired token, missing permission) is final.
 */
export async function startShipBatch(token: string, doFetch: Fetch = fetch, pauseMs = 5000): Promise<ShipStart> {
  let last: ShipStart = { ok: false, status: 0, detail: "not tried" };
  for (let n = 0; n < TRIES; n++) {
    if (n > 0) await new Promise((done) => setTimeout(done, pauseMs));
    try {
      const res = await doFetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          // GitHub's API refuses requests without a User-Agent, and a Worker sends none by itself.
          "User-Agent": "turuj-ship-timer",
        },
        body: JSON.stringify({ ref: "main", inputs: { dry_run: "false" } }),
      });
      if (res.ok) return { ok: true };
      last = { ok: false, status: res.status, detail: (await res.text()).slice(0, 300) };
      if (res.status < 500 && res.status !== 429) return last;
    } catch (err) {
      last = { ok: false, status: 0, detail: String(err).slice(0, 300) };
    }
  }
  return last;
}

/** The e-mail for a start GitHub refused. False when there is no Resend key or Resend refuses. */
export async function tellStartFailed(key: string | undefined, fail: { status: number; detail: string }, doFetch: Fetch = fetch): Promise<boolean> {
  if (!key) return false;
  const answer = fail.status ? `GitHub answered ${fail.status}` : "GitHub could not be reached";
  const text = [
    `The morning "Ship batch" job could not be started: ${answer}.`,
    fail.detail,
    "",
    "Nothing was shipped. If a pull request carries the label ship-next-morning, merge it by hand.",
    "401 or 403 means the SHIP_BATCH_TOKEN secret has expired or lost its permission:",
    "make a new token and store it again (docs/DEPLOY-CLOUDFLARE.md, \"Ship batch timer\").",
    "",
    `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`,
  ].join("\n");
  const res = await doFetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [CONTACT_EMAIL], subject: "Túruj: Ship batch did not start", text }),
  });
  if (!res.ok) console.warn("[ship] mail not sent:", res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

/** One cron run: outside 06:30 or without the token it does nothing. */
export async function shipTimer(at: number, env: ShipEnv, doFetch: Fetch = fetch, pauseMs = 5000): Promise<"not-time" | "no-token" | "started" | "failed"> {
  if (!isShipTime(at)) return "not-time";
  if (!env.SHIP_BATCH_TOKEN) return "no-token";
  const start = await startShipBatch(env.SHIP_BATCH_TOKEN, doFetch, pauseMs);
  if (start.ok) return "started";
  console.warn("[ship] start refused:", start.status, start.detail);
  await tellStartFailed(env.RESEND_API_KEY, start, doFetch);
  return "failed";
}
