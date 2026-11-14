import { COUNTED_HOSTS } from "@/lib/site";

// Previews (every PR build, *.workers.dev) share the live database and KV, so anything a tester
// types there would land in the real data. API routes that write (reviews, feedback, sign-up and
// sign-in, push subscriptions, visit and event counts) refuse on any host that is not one of the
// production hosts (COUNTED_HOSTS, the same list that decides where visits are counted).
// Local development has no shared database, so it stays open.

/** What the UI shows (Slovak, with an English entry in lib/en.ts). */
export const PREVIEW_MESSAGE = "Na náhľade sa neukladá.";

/** Local dev: its own empty database, nothing shared with the live site. */
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** May this host write to the shared data? Production hosts and local development only. */
export function writesAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (COUNTED_HOSTS.includes(h)) return true;
  return LOCAL_HOSTS.includes(h.replace(/:\d+$/, ""));
}

/** A 403 with a JSON message when this request is on a preview, otherwise null (carry on). Call first in every writing route. */
export function refuseOnPreview(req: Request): Response | null {
  if (writesAllowed(new URL(req.url).host)) return null;
  return Response.json({ error: "preview", message: PREVIEW_MESSAGE }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
