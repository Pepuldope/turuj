import { describe, expect, it } from "vitest";
import { TANAP_CLOSURE_SK } from "@/content/uzavery-tanap";
import { TANAP_CLOSURE_EN } from "@/content/uzavery-tanap-en";

// Block-by-block: same kind of block (heading, bullet, table row...) and the same links in the same order.
const kind = (line: string) => (/^#+ /.exec(line)?.[0] ?? (line.startsWith("- ") ? "- " : line === "" ? "" : "p"));
const links = (s: string) => [...s.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
// Section numbers in brackets, e.g. "(42)", must survive translation.
const numbers = (s: string) => [...s.matchAll(/\((\d+)\)\s*$/gm)].map((m) => m[1]);

describe("TANAP closure page translations", () => {
  const sk = TANAP_CLOSURE_SK.split("\n");
  const en = TANAP_CLOSURE_EN.split("\n");
  it("has the same shape in both languages", () => {
    expect(en.map(kind)).toEqual(sk.map(kind));
  });
  it("keeps every link and section number", () => {
    expect(links(TANAP_CLOSURE_EN)).toEqual(links(TANAP_CLOSURE_SK));
    expect(numbers(TANAP_CLOSURE_EN)).toEqual(numbers(TANAP_CLOSURE_SK));
  });
  it("shows the verified-on date", () => {
    expect(TANAP_CLOSURE_EN).toContain("Verified: 31 October 2026");
  });
});
