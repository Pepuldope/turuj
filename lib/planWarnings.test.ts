import { describe, expect, it } from "vitest";
import { collectPlanWarnings, groupPlanWarnings } from "./planWarnings";
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

describe("groupPlanWarnings", () => {
  const x = (key: string, step: string, tone: PlanWarning["tone"]): PlanWarning => ({ key, step, tone, text: key });
  const order = { when: 1, route: 2, access: 3 };
  it("puts one step's warnings in one group with the worst tone", () => {
    const out = groupPlanWarnings([x("dark", "when", "warn"), x("storm", "when", "danger"), x("car", "access", "warn")], order);
    expect(out.map((g) => [g.step, g.tone, g.warnings.map((w) => w.key)])).toEqual([
      ["when", "danger", ["dark", "storm"]],
      ["access", "warn", ["car"]],
    ]);
  });
  it("orders by tone, then step number", () => {
    const out = groupPlanWarnings([x("a", "access", "warn"), x("w", "when", "warn"), x("r", "route", "danger")], order);
    expect(out.map((g) => g.step)).toEqual(["route", "when", "access"]);
  });
  it("is empty without warnings", () => {
    expect(groupPlanWarnings([], order)).toEqual([]);
  });
});
