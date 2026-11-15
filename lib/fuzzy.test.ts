import { describe, expect, it } from "vitest";
import { fuzzyScore, prefixDistance } from "./fuzzy";
import { plain, preparePlaces, searchPlaces } from "./placeSearch";
import type { SearchIndexFile } from "./placeSearch";
import { suggestTowns } from "./townSuggest";

const w = (q: string) => plain(q).split(/\s+/).filter(Boolean);
const score = (q: string, name: string) => fuzzyScore(w(q), plain(name));

describe("fuzzyScore", () => {
  it("forgives one wrong letter from four letters", () => {
    expect(score("chopk", "Chopok")).toBe(1);
    expect(score("chop", "Chopok")).toBeNull(); // exact, found elsewhere
    expect(score("chopek", "Chopok")).toBe(1);
    expect(score("trnsva", "Trnava")).toBe(1);
  });
  it("forgives an adjacent swap", () => {
    expect(score("tranva", "Trnava")).toBe(1);
    expect(score("trnvaa", "Trnava")).toBe(1);
  });
  it("compares with word prefixes", () => {
    expect(score("krvi", "Kriváň")).toBe(1);
    expect(score("strbske plseo", "Štrbské pleso")).toBe(1);
    expect(score("rohcae", "Roháče")).toBe(1);
  });
  it("never forgives a word under four letters", () => {
    expect(score("tra", "Trnava")).toBeNull();
    expect(score("trx", "Trnava")).toBeNull();
  });
  it("allows two slips only from eight letters", () => {
    expect(score("bratislva", "Bratislava")).toBe(1);
    expect(score("bratislxvx", "Bratislava")).toBe(2);
    expect(score("trnxvx", "Trnava")).toBeNull();
  });
  it("cuts off when too far", () => {
    expect(prefixDistance("abcdef", "zzzzzz", 1)).toBe(2);
  });
});

const file: SearchIndexFile = {
  v: 1,
  trips: ["a", "b", "c"],
  places: [
    ["Chopok", 48.9, 19.6, "vrchol", [0, 1]],
    ["Roháče", 49.2, 19.7, "vrchol", [2]],
    ["Štrbské pleso", 49.1, 20.06, "start", [1]],
  ],
};
const index = preparePlaces(file);
const hits = (q: string) => searchPlaces(index, w(q)).hits.map((h) => h.place.name);

describe("place search with typos", () => {
  it("finds places despite a typo", () => {
    expect(hits("chopk")).toEqual(["Chopok"]);
    expect(hits("chpok")).toEqual(["Chopok"]);
    expect(hits("rohace")).toEqual(["Roháče"]);
    expect(hits("strbske plseo")).toEqual(["Štrbské pleso"]);
  });
  it("leaves three-letter queries exact", () => {
    expect(hits("chp")).toEqual([]);
  });
  it("gives a correct query the same results as exact matching", () => {
    expect(hits("chopok")).toEqual(["Chopok"]);
    const r = searchPlaces(index, w("chopok"));
    expect([...r.slugs]).toEqual(["a", "b"]);
  });
  it("ranks exact above fuzzy", () => {
    const f: SearchIndexFile = { v: 1, trips: ["x", "y"], places: [["Chopek", 1, 1, "vrchol", [0, 1]], ["Chopok", 40, 1, "vrchol", [1]]] };
    const r = searchPlaces(preparePlaces(f), w("chopok"));
    expect(r.hits.map((h) => h.place.name)).toEqual(["Chopok", "Chopek"]);
  });
});

describe("town suggestions with typos", () => {
  const at = { lat: 48, lon: 19 };
  const towns = ["Trnava", "Tvrdošín", "Banská Bystrica", "Žilina"].map((name) => ({ id: name, name, location: at }));
  const names = (q: string) => suggestTowns(q, towns).map((t) => t.name);
  it("finds a town despite a typo", () => {
    expect(names("tranva")).toEqual(["Trnava"]);
    expect(names("trnava")).toEqual(["Trnava"]);
    expect(names("zilna")).toEqual(["Žilina"]);
    expect(names("banska bystrca")).toEqual(["Banská Bystrica"]);
  });
  it("keeps three-letter queries exact", () => {
    expect(names("zlin")).toEqual(["Žilina"]);
    expect(names("trx")).toEqual([]);
  });
  it("puts exact matches first", () => {
    expect(names("tr")).toEqual(["Trnava"]);
  });
});
