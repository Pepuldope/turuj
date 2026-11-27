import { describe, expect, it } from "vitest";
import { newestVerified, trailStatus } from "@/lib/trailStatus";
import type { Closure } from "@/lib/types";

const closure = (over: Partial<Closure>): Closure => ({ id: "c", trail_id: "x", kind: "rocna", starts_on: "2026-11-01", ends_on: "2026-11-30", reason: "r", source_url: "https://example.org", verified_on: "2026-11-24", ...over });

describe("trailStatus", () => {
  it("is null before the day is known", () => {
    expect(trailStatus([closure({})], null)).toBeNull();
  });
  it("is closed on a day a rule is in force", () => {
    expect(trailStatus([closure({})], "2026-11-28")).toBe("closed");
  });
  it("is unverified with no rules at all", () => {
    expect(trailStatus([], "2026-11-28")).toBe("unverified");
  });
  it("is no known closure when rules exist but none is in force", () => {
    expect(trailStatus([closure({})], "2026-12-15")).toBe("no-known-closure");
  });
});

describe("newestVerified", () => {
  it("takes the latest date", () => {
    expect(newestVerified([closure({ verified_on: "2026-11-02" }), closure({ verified_on: "2026-11-24" })])).toBe("2026-11-24");
  });
  it("is null with none", () => {
    expect(newestVerified([])).toBeNull();
    expect(newestVerified([closure({ verified_on: "" })])).toBeNull();
  });
});
