import { refuseOnPreview } from "@/lib/previewGuard";
import { endSession, sessionCookie } from "@/lib/auth";
import { OTHER_SITE, fromOtherSite } from "@/lib/routeGuard";

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  try {
    await endSession(request);
  } catch (err) {
    console.warn("[auth] logout failed:", err);
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie("", 0), "Cache-Control": "no-store" } });
}
