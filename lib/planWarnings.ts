/** One line of the "Pred odchodom skontrolujte" recap: a warning the plan's steps show, and the step that fixes it. */
export interface PlanWarning {
  /** Stable key (also what a test looks for). */
  key: string;
  /** The step where it can be fixed (a PlanStep id: when, route, access, places). */
  step: string;
  /** danger: real danger (storms, heavy rain, snow); warn: advice. Danger comes first. */
  tone: "danger" | "warn";
  text: string;
}

/** The candidates in the order the steps show them; falsy ones are dropped, danger moves to the top (the order within a tone stays). */
export function collectPlanWarnings(candidates: Array<PlanWarning | null | false | undefined>): PlanWarning[] {
  const list = candidates.filter((c): c is PlanWarning => !!c && c.text.trim() !== "");
  return [...list.filter((w) => w.tone === "danger"), ...list.filter((w) => w.tone === "warn")];
}

/** The warnings of one step, as one item of the recap. */
export interface PlanWarningGroup {
  step: string;
  /** The worst tone of its lines. */
  tone: "danger" | "warn";
  warnings: PlanWarning[];
}

/**
 * One group per step (its lines in the order given), danger groups first, then by step number
 * (`order` maps a step id to its number; unknown steps go last).
 */
export function groupPlanWarnings(warnings: PlanWarning[], order: Record<string, number>): PlanWarningGroup[] {
  const groups: PlanWarningGroup[] = [];
  for (const w of warnings) {
    let g = groups.find((x) => x.step === w.step);
    if (!g) groups.push((g = { step: w.step, tone: "warn", warnings: [] }));
    g.warnings.push(w);
    if (w.tone === "danger") g.tone = "danger";
  }
  const n = (g: PlanWarningGroup) => order[g.step] ?? Infinity;
  return groups.sort((a, b) => (a.tone === b.tone ? n(a) - n(b) : a.tone === "danger" ? -1 : 1));
}
