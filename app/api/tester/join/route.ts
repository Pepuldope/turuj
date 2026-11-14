import { refuseOnPreview } from "@/lib/previewGuard";
import { currentAccount, markTester } from "@/lib/auth";
import { OTHER_SITE, fromOtherSite } from "@/lib/routeGuard";

// "Chcem testovať" in the footer, pressed while signed in: marks that account as a tester, so the
// days it uses Túruj are counted (lib/auth.ts markTester, school project's "active users" goal).

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  const headers = { "Cache-Control": "no-store" };
  try {
    const account = await currentAccount(request);
    if (!account) return Response.json({ ok: false, error: "signedout" }, { status: 401, headers });
    await markTester(account.id);
    return Response.json({ ok: true }, { headers });
  } catch (err) {
    console.warn("[tester] join failed:", err);
    return Response.json({ ok: false, error: "off" }, { status: 500, headers });
  }
}
