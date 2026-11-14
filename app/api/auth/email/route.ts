import { refuseOnPreview } from "@/lib/previewGuard";
import { CODE_MIN, cleanEmail, newLoginCode, randomCode } from "@/lib/auth";
import { sendCodeMail } from "@/lib/authMail";
import { OTHER_SITE, TOO_MANY, fromOtherSite, overCallLimit } from "@/lib/routeGuard";

// Step 1 of the email sign-in: a 6-digit code to the given address (lib/auth.ts).

export async function POST(request: Request): Promise<Response> {
  const preview = refuseOnPreview(request);
  if (preview) return preview;
  if (fromOtherSite(request)) return OTHER_SITE();
  if (await overCallLimit(request, "auth")) return TOO_MANY();
  let body: { email?: unknown; lang?: unknown } = {};
  try {
    body = JSON.parse((await request.text()).slice(0, 500));
  } catch {}
  const email = cleanEmail(body.email);
  if (!email) return Response.json({ error: "email" }, { status: 400 });
  const code = randomCode();
  try {
    const ask = await newLoginCode(email, code);
    if (ask === "wait") return Response.json({ error: "wait" }, { status: 429 });
    if (ask === "no-db") return Response.json({ error: "off" }, { status: 503 });
    const sent = await sendCodeMail(email, code, CODE_MIN, body.lang === "en" ? "en" : "sk");
    if (!sent) return Response.json({ error: "mail" }, { status: 503 });
    return Response.json({ sent: true });
  } catch (err) {
    console.warn("[auth] code not made:", err);
    return Response.json({ error: "off" }, { status: 503 });
  }
}
