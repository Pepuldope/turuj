import { describe, expect, it } from "vitest";
import { compareClosures } from "./tanapCompare";

const ours = [
  { id: "tanap-sezonna-uzavera", starts_on: "2026-11-01", ends_on: "2027-05-31" },
  { id: "tanap-juranova-dolina", starts_on: "2026-11-01", ends_on: "2027-04-30" },
  { id: "other-rule", starts_on: "2026-01-01", ends_on: "2026-02-01" },
];

describe("compareClosures", () => {
  it("reports nothing when the dates agree (other years included, other rules ignored)", () => {
    const official = [
      { ref: "sedlá a štíty", starts_on: "2025-11-01", ends_on: "2026-05-31" },
      { ref: "Juráňova dolina", starts_on: "2025-11-01", ends_on: "2026-04-30" },
    ];
    expect(compareClosures(ours, official)).toEqual([]);
  });

  it("reports a closure of theirs we lack and a rule of ours they lack", () => {
    const out = compareClosures(ours, [{ ref: "sedlá a štíty", starts_on: "2026-11-01", ends_on: "2027-06-15" }, { ref: "Juráňova dolina", starts_on: "2026-11-01", ends_on: "2027-04-30" }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("sedlá a štíty");
    expect(out[1]).toContain("tanap-sezonna-uzavera");
  });
});
