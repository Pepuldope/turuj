import { describe, expect, it } from "vitest";
import { withServerReviews } from "@/lib/reviewed";
import type { Kept } from "@/lib/reviewed";

const none = { fit: null, crowded: null, timing: null };
const kept = (stars: Record<string, number> = {}): Kept => ({ stars, choices: {} });

describe("withServerReviews", () => {
  it("adds the server's review for a trip the browser has none for, stars and choices", () => {
    const next = withServerReviews(kept({ krivan: 4 }), { rysy: { stars: 5, fit: "tazsie", crowded: true, timing: "dlhsie" } });
    expect(next.stars).toEqual({ krivan: 4, rysy: 5 });
    expect(next.choices).toEqual({ rysy: { fit: "tazsie", crowded: true, timing: "dlhsie" } });
  });

  it("keeps the browser's own copy of a trip it knows", () => {
    const mine = kept({ krivan: 4 });
    expect(withServerReviews(mine, { krivan: { stars: 2, fit: "popis", crowded: false, timing: null } })).toBe(mine);
  });

  it("is the same object when nothing was added, so nothing is written", () => {
    const mine = kept({ krivan: 4 });
    expect(withServerReviews(mine, {})).toBe(mine);
  });

  it("takes only whole stars from 1 to 5, known choices, and nothing from an answer of another shape", () => {
    const mine = kept();
    const next = withServerReviews(mine, { a: { stars: 0 }, b: { stars: 6 }, c: { stars: 2.5 }, d: { stars: "4" }, e: 3, f: { stars: 3, fit: "x", crowded: 1, timing: 7 } });
    expect(next.stars).toEqual({ f: 3 });
    expect(next.choices).toEqual({ f: none });
    expect(withServerReviews(mine, null)).toBe(mine);
    expect(withServerReviews(mine, [1, 2])).toBe(mine);
    expect(withServerReviews(mine, "x")).toBe(mine);
  });
});
