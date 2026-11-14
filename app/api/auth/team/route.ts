import { refuseOnPreview } from "@/lib/previewGuard";
import { currentAccount, setTeam } from "@/lib/auth";
import { OTHER_SITE, fromOtherSite } from "@/lib/routeGuard";

// "Toto je tímový účet" on /statistiky: marks the signed-in account only, never another one.

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  const headers = { "Cache-Control": "no-store" };
  try {
    const account = await currentAccount(request);
    if (!account) return Response.json({ ok: false, error: "signedout" }, { status: 401, headers });
    const body = (await request.json().catch(() => null)) as { team?: unknown } | null;
    if (typeof body?.team !== "boolean") return Response.json({ ok: false, error: "bad" }, { status: 400, headers });
    await setTeam(account.id, body.team);
    return Response.json({ ok: true, team: body.team }, { headers });
  } catch (err) {
    console.warn("[auth] team failed:", err);
    return Response.json({ ok: false, error: "off" }, { status: 500, headers });
  }
}
