import { refuseOnPreview } from "@/lib/previewGuard";
import { accountFor, checkLoginCode, cleanEmail, okPassword, sessionCookie, setName, setPassword, startSession } from "@/lib/auth";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overCallLimit } from "@/lib/routeGuard";

// Step 2 of the email code: the typed code starts a session (lib/auth.ts). Signing up and a new
// password after "Zabudli ste heslo?" send the password (and on sign-up the name) with the code,
// so it is set only once the email is proven.

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  if (await overCallLimit(request, "auth")) return TOO_MANY();
  let body: { email?: unknown; code?: unknown; password?: unknown; name?: unknown } = {};
  try {
    body = JSON.parse((await request.text()).slice(0, 1000));
  } catch {}
  const email = cleanEmail(body.email);
  const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) return Response.json({ error: "wrong" }, { status: 400 });
  // Checked before the code, so a too-short password doesn't use the code up.
  if (body.password !== undefined && !okPassword(body.password)) return Response.json({ error: "pw" }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  try {
    const check = await checkLoginCode(email, code);
    if (check !== "ok") return Response.json({ error: check }, { status: 400 });
    const account = await accountFor(email);
    if (okPassword(body.password)) await setPassword(account.id, body.password);
    if (name && !account.name) {
      await setName(account.id, name);
      account.name = name;
    }
    const token = await startSession(account.id, "email");
    return Response.json({ account: { email: account.email, name: account.name } }, { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } });
  } catch (err) {
    console.warn("[auth] code check failed:", err);
    return Response.json({ error: "off" }, { status: 503 });
  }
}
