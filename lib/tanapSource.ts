// TANAP's own "Časové vymedzenie uzáver" chart (https://www.tanap.sk/wp-content/uploads/uzaveryTURISTIKA.html,
// the page tanap.sk embeds on its hiking pages). It lists, per activity, the periods when the
// activity is ALLOWED (inline JS, `data` array); the closure is the gap between them. We read the
// §4 hiking rows and turn the gaps into OfficialClosure[] for lib/tanapCompare.ts. Report only:
// nothing here changes our data. If the page changes shape we say "unavailable", never "differs".
import type { OfficialClosure } from "./tanapCompare";

export const TANAP_CHART_URL = "https://www.tanap.sk/wp-content/uploads/uzaveryTURISTIKA.html";
export const TANAP_USER_AGENT = "Turuj-tanap-check/1.0 (+https://turuj.sk; weekly closure comparison, read-only)";

export type OfficialResult = { ok: true; closures: OfficialClosure[] } | { ok: false; reason: string };

const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // non-leap, same as TANAP's chart
const doy = (m: number, d: number) => CUM[m - 1] + d;
const pad = (n: number) => String(n).padStart(2, "0");
function md(day: number): string {
  for (let m = 11; m >= 0; m--) if (day > CUM[m]) return `${pad(m + 1)}-${pad(day - CUM[m])}`;
  return "01-01";
}

/** Closed periods = the gaps between the allowed periods (day-of-year pairs, 1..365). */
function gaps(allowed: [number, number][]): { from: number; to: number; wraps: boolean }[] {
  const a = [...allowed].sort((x, y) => x[0] - y[0]);
  const out: { from: number; to: number; wraps: boolean }[] = [];
  for (let i = 0; i + 1 < a.length; i++) if (a[i + 1][0] - a[i][1] > 1) out.push({ from: a[i][1] + 1, to: a[i + 1][0] - 1, wraps: false });
  const head = a[0][0] > 1, tail = a[a.length - 1][1] < 365;
  if (head && tail) out.push({ from: a[a.length - 1][1] + 1, to: a[0][0] - 1, wraps: true });
  else if (tail) out.push({ from: a[a.length - 1][1] + 1, to: 365, wraps: false });
  else if (head) out.push({ from: 1, to: a[0][0] - 1, wraps: false });
  return out;
}

/**
 * Parses the chart HTML. `year` is the year the closures start in (a closure running over New
 * Year ends in year + 1); the comparison only looks at month and day. Returns a reason instead
 * of a list when the page is not the shape we know, e.g. no seasonal-closure hiking row.
 */
export function parseTanapChart(html: string, year: number): OfficialResult {
  const block = html.match(/const\s+data\s*=\s*\[([\s\S]*?)\n\];/);
  if (!block) return { ok: false, reason: "chart data array not found in the page" };
  const rows = [...block[1].matchAll(/label:\s*'((?:[^'\\]|\\.)*)'[\s\S]*?segs:\s*\[(.*?)\]\s*\}/g)];
  const closures: OfficialClosure[] = [];
  let hikingRows = 0, seasonal = false;
  for (const [, label, segs] of rows) {
    if (!/^§4\s+Pešia turistika/.test(label)) continue;
    const allowed = [...segs.matchAll(/doy\((\d+),\s*(\d+)\)\s*,\s*doy\((\d+),\s*(\d+)\)/g)].map((s) => [doy(+s[1], +s[2]), doy(+s[3], +s[4])] as [number, number]);
    if (!allowed.length || allowed.some(([s, e]) => !(s >= 1 && e <= 365 && s <= e))) return { ok: false, reason: `unreadable periods in row "${label}"` };
    hikingRows++;
    if (/sezónnou uzáverou/.test(label)) seasonal = true;
    for (const g of gaps(allowed)) {
      closures.push({ ref: label.replace(/^§4\s+/, ""), starts_on: `${year}-${md(g.from)}`, ends_on: `${year + (g.wraps ? 1 : 0)}-${md(g.to)}` });
    }
  }
  if (!hikingRows || !seasonal) return { ok: false, reason: "no §4 hiking rows with the seasonal closure found (page changed?)" };
  return { ok: true, closures };
}

/** Fetches the chart politely (descriptive User-Agent, 20 s timeout). Any failure is a reason, not a throw. */
export async function fetchOfficialClosures(year: number, fetchImpl: typeof fetch = fetch): Promise<OfficialResult> {
  try {
    const res = await fetchImpl(TANAP_CHART_URL, { headers: { "User-Agent": TANAP_USER_AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, reason: `tanap.sk answered HTTP ${res.status}` };
    return parseTanapChart(await res.text(), year);
  } catch (e) {
    return { ok: false, reason: `fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
