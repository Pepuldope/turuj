import { currentAccount } from "@/lib/auth";

// Who is signed in on this browser (never cached: the answer is per person).

export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const a = await currentAccount(request);
    return Response.json({ account: a ? { email: a.email, name: a.name, team: a.team === true } : null }, { headers });
  } catch (err) {
    console.warn("[auth] me failed:", err);
    return Response.json({ account: null }, { headers });
  }
}
