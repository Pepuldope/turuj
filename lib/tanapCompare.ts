// Weekly comparison of our TANAP closures (data/closure-rules.json) with TANAP's official list
// (scripts/check-tanap-closures.ts, .github/workflows/tanap-check.yml). Closure data is safety
// data, so a difference is shown to a person, never fixed automatically.

/** One closure as TANAP states it. `ref` is how to name it in the issue (their stretch or trail). */
export interface OfficialClosure {
  ref: string;
  starts_on: string;
  ends_on: string;
}

export interface OurRule {
  id: string;
  starts_on?: string;
  ends_on?: string;
}

/** The recurring TANAP rules we keep: ids start with "tanap-". */
export const tanapRules = (rules: OurRule[]): OurRule[] => rules.filter((r) => r.id.startsWith("tanap-"));

/**
 * Differences, one plain sentence each, in the order of the official list. An official closure
 * with the same dates as one of ours is a match; with no match at all it is reported, and so is
 * each of our rules that no official closure has the dates of. Empty list: nothing to report.
 * Dates compare as month and day, so a rule rolled to next year still matches this year's list.
 */
export function compareClosures(ours: OurRule[], official: OfficialClosure[]): string[] {
  const md = (d?: string) => (d ?? "").slice(5);
  const key = (s?: string, e?: string) => `${md(s)}..${md(e)}`;
  const mine = tanapRules(ours);
  const ourKeys = new Set(mine.map((r) => key(r.starts_on, r.ends_on)));
  const theirKeys = new Set(official.map((o) => key(o.starts_on, o.ends_on)));
  const out: string[] = [];
  for (const o of official)
    if (!ourKeys.has(key(o.starts_on, o.ends_on))) out.push(`TANAP lists "${o.ref}" closed ${o.starts_on} to ${o.ends_on}; no rule of ours has these dates.`);
  for (const r of mine)
    if (!theirKeys.has(key(r.starts_on, r.ends_on))) out.push(`Our rule ${r.id} (${r.starts_on} to ${r.ends_on}) matches nothing in TANAP's list.`);
  return out;
}
