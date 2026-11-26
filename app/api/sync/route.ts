import { currentAccount } from "@/lib/auth";
import { refuseOnPreview } from "@/lib/previewGuard";
import { OTHER_SITE, fromOtherSite } from "@/lib/routeGuard";
import { MAX_REQUEST } from "@/lib/syncMerge";
import type { SyncRequest } from "@/lib/syncMerge";
import { syncAccount } from "@/lib/syncStore";

// Account sync: one POST carries a device's saved trips and visits and answers with what it is
// missing (lib/syncStore.ts). Only for a signed-in account, and only on the live site.

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  const headers = { "Cache-Control": "no-store" };
  try {
    const account = await currentAccount(request);
    if (!account) return Response.json({ ok: false, error: "signedout" }, { status: 401, headers });
    const text = await request.text();
    if (text.length > MAX_REQUEST) return Response.json({ ok: false, error: "big" }, { status: 413, headers });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return Response.json({ ok: false, error: "bad" }, { status: 400, headers });
    return Response.json(await syncAccount(account.id, body as SyncRequest), { headers });
  } catch (err) {
    console.warn("[sync] failed:", err);
    return Response.json({ ok: false, error: "off" }, { status: 500, headers });
  }
}
