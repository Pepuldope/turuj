import { describe, expect, it } from "vitest";
import { STAY_BY_KIND, goalStayDefault } from "@/lib/goalStay";

describe("goalStayDefault", () => {
  it("uses the kind's default for an ordinary goal", () => {
    expect(goalStayDefault("vrchol", "Záruby")).toEqual({ min: STAY_BY_KIND.vrchol, guided: null });
    expect(goalStayDefault("jaskyna", "Javorinka").min).toBe(STAY_BY_KIND.jaskyna);
  });
  it("gives a show cave its tour plus the wait for the next start (Peter, 17 Nov)", () => {
    const d = goalStayDefault("jaskyna", "Demänovská jaskyňa Slobody");
    expect(d.guided).not.toBeNull();
    expect(d.min).toBe(60 + 30);
  });
  it("matches the name with stray spaces and falls back without a name", () => {
    expect(goalStayDefault("jaskyna", " Jaskyňa Driny ").min).toBe(35 + 30);
    expect(goalStayDefault("hrad", null).min).toBe(STAY_BY_KIND.hrad);
  });
});
