import { currentAccount, recordTesterDay, sessionToken } from "@/lib/auth";
import { writesAllowed } from "@/lib/previewGuard";

// Who is signed in on this browser (never cached: the answer is per person).

export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  // Fast path: no session cookie, nobody to look up (no database call).
  if (!sessionToken(request)) return Response.json({ account: null }, { headers });
  try {
    const a = await currentAccount(request);
    // Testers' days (school KPI): the app asks this once per page load, so it is where "used today" is noted.
    // Previews share the live database and never write to it (lib/previewGuard.ts).
    if (a && writesAllowed(new URL(request.url).host)) await recordTesterDay(a.id).catch((err) => console.warn("[tester] day failed:", err));
    return Response.json({ account: a ? { email: a.email, name: a.name, team: a.team === true } : null }, { headers });
  } catch (err) {
    console.warn("[auth] me failed:", err);
    return Response.json({ account: null }, { headers });
  }
}
