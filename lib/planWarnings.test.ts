import { describe, expect, it } from "vitest";
import { collectPlanWarnings } from "./planWarnings";
import type { PlanWarning } from "./planWarnings";

const w = (key: string, tone: PlanWarning["tone"], text = key): PlanWarning => ({ key, step: "when", tone, text });

describe("collectPlanWarnings", () => {
  it("is empty when nothing is active", () => {
    expect(collectPlanWarnings([null, false, undefined])).toEqual([]);
  });
  it("drops candidates with no text", () => {
    expect(collectPlanWarnings([w("a", "warn", "  ")])).toEqual([]);
  });
  it("puts danger first and keeps the order within a tone", () => {
    const out = collectPlanWarnings([w("late", "warn"), w("frost", "warn"), false, w("storm", "danger"), w("rain", "danger")]);
    expect(out.map((x) => x.key)).toEqual(["storm", "rain", "late", "frost"]);
  });
});
