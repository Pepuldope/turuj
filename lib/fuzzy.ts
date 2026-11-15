// Typo-forgiving matching shared by the trip/place search and the town search. Runs in the
// browser on names already lower-cased and stripped of accents (see `plain` / `foldName`).
// A query word may be off by one wrong letter (4+ letters) or two (8+ letters), counting an
// adjacent swap as one slip, and is compared with the *start* of each word of the name, so a
// half-typed word still matches: "chopk" ~ "chopok", "kriv" ~ "krivan".

/** How many slips a query word of this length may have. Under 4 letters: none (too many false hits). */
export const fuzzyLimit = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/**
 * Smallest edit distance (insert, delete, replace, adjacent swap) between `q` and any prefix of
 * `w`, or `limit + 1` when it is more than `limit`. Gives up as soon as a whole row is over the limit.
 */
export function prefixDistance(q: string, w: string, limit: number): number {
  const m = q.length;
  const n = w.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let best = m === 0 ? 0 : Infinity;
  // rows are the letters of q, columns the letters of w; the last row's smallest cell is the answer
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = q[i - 1] === w[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && q[i - 1] === w[j - 2] && q[i - 2] === w[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    if (i === m) for (let j = 0; j <= n; j++) best = Math.min(best, cur[j]);
    prev2 = prev;
    prev = cur;
  }
  return Math.min(best, limit + 1);
}

const wordsOf = new Map<string, string[]>();
/** The words of a normalised name, split once and remembered. */
function nameWords(key: string): string[] {
  let w = wordsOf.get(key);
  if (!w) {
    w = key.split(/[\s\-–,.()/]+/).filter(Boolean);
    wordsOf.set(key, w);
  }
  return w;
}

/**
 * Total slips (at least 1) for every query word to match the start of some word of `key`, or null when
 * one word is too far off or nothing is off at all (that is an exact match, found elsewhere). Short words (under 4 letters) must match exactly, as a substring.
 */
export function fuzzyScore(words: readonly string[], key: string): number | null {
  if (words.length === 0) return null;
  const nw = nameWords(key);
  let total = 0;
  for (const q of words) {
    if (key.includes(q)) continue;
    const limit = fuzzyLimit(q.length);
    if (limit === 0) return null;
    let best = limit + 1;
    for (const w of nw) {
      // a name word shorter than the query by more than the limit can't match
      if (w.length + limit < q.length) continue;
      const d = prefixDistance(q, w, Math.min(limit, best - 1));
      if (d < best) best = d;
      if (best === 1) break;
    }
    if (best > limit) return null;
    total += best;
  }
  return total > 0 ? total : null;
}
