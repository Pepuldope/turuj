import { refuseOnPreview } from "@/lib/previewGuard";
import { cleanEmail, passwordLogin, sessionCookie, startSession } from "@/lib/auth";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overCallLimit } from "@/lib/routeGuard";

// Signing in with email and password (lib/auth.ts).

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  if (await overCallLimit(request, "auth")) return TOO_MANY();
  let body: { email?: unknown; password?: unknown } = {};
  try {
    body = JSON.parse((await request.text()).slice(0, 1000));
  } catch {}
  const email = cleanEmail(body.email);
  if (!email || typeof body.password !== "string" || !body.password) return Response.json({ error: "wrongpw" }, { status: 400 });
  try {
    const r = await passwordLogin(email, body.password.slice(0, 200));
    if (!r.ok) return Response.json({ error: r.why === "wrong" ? "wrongpw" : r.why }, { status: 400 });
    const token = await startSession(r.account.id, "password");
    return Response.json({ account: { email: r.account.email, name: r.account.name } }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch (err) {
    console.warn("[auth] password check failed:", err);
    return Response.json({ error: "off" }, { status: 503 });
  }
}
