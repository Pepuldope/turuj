import { describe, expect, it } from "vitest";
import { PRIVACY_SK } from "@/content/legal/sukromie";
import { PRIVACY_EN } from "@/content/legal/sukromie.en";
import { TERMS_SK } from "@/content/legal/podmienky";
import { fillFacts } from "@/lib/legalText";

describe("terms and privacy texts", () => {
  it("fill every {{fact}} (COUNT_ME is the opt-out button)", () => {
    for (const text of [TERMS_SK, PRIVACY_SK, PRIVACY_EN]) {
      expect(fillFacts(text).replace("{{COUNT_ME}}", "").match(/\{\{\w+\}\}/g)).toBeNull();
    }
  });

  it("keep no draft markers", () => {
    for (const text of [TERMS_SK, PRIVACY_SK]) expect(text).not.toMatch(/DOPLNIŤ|NÁVRH|Overiť/);
  });
});

// The English privacy page is a translation of the Slovak one. A change made in one language only shows up here.
describe("English privacy text follows the Slovak one", () => {
  const blocks = (text: string) => text.split(/\n\s*\n/).map((b) => b.trim());
  const kind = (b: string) => (b.startsWith("### ") ? `heading ${b.match(/^### (\d+)\./)?.[1]}` : b.startsWith("|") ? `table ${b.split("\n").length} rows` : b.includes("\n- ") || b.startsWith("- ") ? `list ${b.split("\n").filter((l) => l.startsWith("- ")).length}` : /^\{\{\w+\}\}$/.test(b) ? "block" : "text");
  const sk = blocks(PRIVACY_SK);
  const en = blocks(PRIVACY_EN);

  it("has the same blocks in the same order: headings, tables with as many rows, lists with as many points", () => {
    expect(en.map(kind)).toEqual(sk.map(kind));
  });

  it("names the same cookies and storage keys, block by block", () => {
    const codes = (b: string) => [...b.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    expect(en.map(codes)).toEqual(sk.map(codes));
  });

  it("keeps the same numbers (days, minutes, metres, articles) in every block", () => {
    const numbers = (b: string) => (b.match(/\d+/g) ?? []).sort();
    expect(en.map(numbers)).toEqual(sk.map(numbers));
  });

  it("has no Slovak fact left in it", () => {
    expect(PRIVACY_EN).not.toMatch(/\{\{(CONTROLLERS|DB_ACCESS|OPERATORS|OPERATORS_SHORT)\}\}/);
  });
});
