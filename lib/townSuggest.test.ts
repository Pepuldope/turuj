import { describe, expect, it } from "vitest";
import { suggestTowns } from "@/lib/townSuggest";

const at = { lat: 48, lon: 19 };
const TOWNS = ["Banská Bystrica", "Banská Štiavnica", "Bratislava", "Žilina", "Žiar nad Hronom", "Stará Turá", "Turčianske Teplice"].map((name) => ({
  id: name,
  name,
  location: at,
}));
const names = (q: string) => suggestTowns(q, TOWNS).map((t) => t.name);

describe("suggestTowns", () => {
  it("needs two letters", () => {
    expect(names("b")).toEqual([]);
    expect(names("  ")).toEqual([]);
  });
  it("matches a prefix, ignoring case and accents", () => {
    expect(names("zil")).toEqual(["Žilina"]);
    expect(names("ŽI")).toEqual(["Žilina", "Žiar nad Hronom"]);
    expect(names("bra")).toEqual(["Bratislava"]);
  });
  it("matches the start of a later word, after the names that start with it", () => {
    expect(names("bystr")).toEqual(["Banská Bystrica"]);
    expect(names("tu")).toEqual(["Turčianske Teplice", "Stará Turá"]);
  });
  it("treats a space or a hyphen alike", () => {
    expect(names("banska-s")).toEqual(["Banská Štiavnica"]);
  });
  it("gives at most six", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, name: `Test ${i}`, location: at }));
    expect(suggestTowns("te", many)).toHaveLength(6);
  });
});
