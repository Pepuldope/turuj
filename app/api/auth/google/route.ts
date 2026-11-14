import { refuseOnPreview } from "@/lib/previewGuard";
import { accountFor, cleanEmail, randomToken, safeNext, sessionCookie, startSession } from "@/lib/auth";

// "Pokračovať cez Google" (lib/auth.ts). Without ?code this sends the browser to Google; Google
// sends it back here with ?code, which is swapped for the person's name and email. The client
// id and secret are Cloudflare secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET), from the Google
// Cloud project Peter set up (sign-in/setup-steps.md); the redirect address must be listed there.

const STATE_COOKIE = "turuj_g";

function back(next: string, error?: string): Response {
  const url = error ? `${next}${next.includes("?") ? "&" : "?"}prihlasenie=${error}` : next;
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}

/** A client id with or without Google's ".apps.googleusercontent.com" ending (Google takes both). */
const bare = (clientId: string) => clientId.trim().replace(/\.apps\.googleusercontent\.com$/, "");

function payload(idToken: string): Record<string, unknown> | null {
  try {
    const part = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Previews share the live database: no sign-in there (lib/previewGuard.ts). Back to the page with a note.
  if (refuseOnPreview(request)) return back(safeNext(url.searchParams.get("next")), "preview");
  // Trimmed: a key pasted into Cloudflare with a space or new line still works.
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirect = `${url.origin}/api/auth/google`;
  const code = url.searchParams.get("code");

  if (!code) {
    const next = safeNext(url.searchParams.get("next"));
    if (!id || !secret) return back(next, "off");
    if (url.searchParams.get("error")) return back(next, "zrusene");
    const state = randomToken(16);
    const go = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    go.search = new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
    const headers = new Headers({ Location: go.toString(), "Cache-Control": "no-store" });
    headers.append("Set-Cookie", `${STATE_COOKIE}=${state}.${encodeURIComponent(next)}; Path=/api/auth/google; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null, { status: 302, headers });
  }

  // Back from Google: the state must match the one this browser was given.
  const saved = (request.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${STATE_COOKIE}=([A-Za-z0-9_-]+)\\.([^;]*)`));
  const next = safeNext(saved ? decodeURIComponent(saved[2]) : "/");
  // Each failure says which step it was (shown after the message), so a screenshot tells us.
  if (!saved || saved[1] !== url.searchParams.get("state") || !id || !secret) return back(next, "chyba-stav");
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: "authorization_code" }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[auth] google token:", res.status, text.slice(0, 200));
      const why = (text.match(/"error"\s*:\s*"([a-z_]+)"/)?.[1] ?? String(res.status)).replace(/_/g, "-");
      return back(next, `chyba-token-${why}`);
    }
    const { id_token } = (await res.json()) as { id_token?: string };
    // Straight from Google over TLS, so its claims are Google's (OpenID Connect, code flow).
    const p = id_token ? payload(id_token) : null;
    const email = cleanEmail(p?.email);
    const iss = String(p?.iss ?? "");
    const bad = !p ? "id" : !email ? "email" : p.email_verified !== true ? "overenie" : bare(String(p.aud)) !== bare(id) ? `aud-${id.length}-${String(p.aud).length}` : !iss.endsWith("accounts.google.com") ? "iss" : typeof p.sub !== "string" ? "sub" : null;
    if (bad || !p || !email || typeof p.sub !== "string") return back(next, `chyba-udaje-${bad}`);
    const account = await accountFor(email, { sub: p.sub, name: typeof p.name === "string" ? p.name.slice(0, 80) : null });
    const token = await startSession(account.id, "google");
    const headers = new Headers({ Location: next, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionCookie(token));
    headers.append("Set-Cookie", `${STATE_COOKIE}=; Path=/api/auth/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return new Response(null, { status: 302, headers });
  } catch (err) {
    console.warn("[auth] google failed:", err);
    return back(next, "chyba-db");
  }
}
