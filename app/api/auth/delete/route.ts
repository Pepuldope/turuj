import { refuseOnPreview } from "@/lib/previewGuard";
import { currentAccount, deleteAccount, sessionCookie } from "@/lib/auth";
import { OTHER_SITE, fromOtherSite } from "@/lib/routeGuard";

// "Zmazať účet" in the account menu: removes the signed-in account at once (/sukromie, bod 7).

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  const headers = { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" };
  try {
    const account = await currentAccount(request);
    if (!account) return Response.json({ ok: false, error: "signedout" }, { status: 401, headers });
    await deleteAccount(account);
    return Response.json({ ok: true }, { headers });
  } catch (err) {
    console.warn("[auth] delete failed:", err);
    return Response.json({ ok: false, error: "off" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
