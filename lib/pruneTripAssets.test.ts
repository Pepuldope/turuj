import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOLERANCE, isTripFile, loadedEnough } from "../scripts/prune-trip-assets.mjs";

describe("prune trip assets (scripts/prune-trip-assets.mjs)", () => {
  it("keeps index.json, list.json and anything that is not a trip file", () => {
    expect(isTripFile("index.json")).toBe(false);
    expect(isTripFile("list.json")).toBe(false);
    expect(isTripFile("krivan.json")).toBe(true);
    expect(isTripFile("krivan-od-auta.json")).toBe(true);
    expect(isTripFile("notes.txt")).toBe(false);
  });

  it("needs the database to hold about as many rows as there are files", () => {
    expect(loadedEnough(6493, 6493)).toBe(true);
    expect(loadedEnough(6493 - TOLERANCE, 6493)).toBe(true);
    expect(loadedEnough(6493 - TOLERANCE - 1, 6493)).toBe(false);
    expect(loadedEnough(0, 6493)).toBe(false);
    expect(loadedEnough(Number.NaN, 6493)).toBe(false);
  });

  it("deletes the trip files only when the count is confirmed", () => {
    const root = mkdtempSync(join(tmpdir(), "prune-"));
    const trips = join(root, "data", "trips");
    mkdirSync(trips, { recursive: true });
    const slugs = Array.from({ length: TOLERANCE + 10 }, (_, i) => `trip-${i}.json`);
    for (const f of ["index.json", "list.json", ...slugs]) writeFileSync(join(trips, f), "{}");
    const run = (count: string) => {
      try {
        execFileSync("node", ["scripts/prune-trip-assets.mjs", "--dir", root, "--db-count", count], { stdio: "pipe" });
        return 0;
      } catch (err) {
        return (err as { status: number }).status;
      }
    };
    expect(run("3")).toBe(1);
    expect(readdirSync(trips)).toHaveLength(slugs.length + 2);
    expect(run(String(slugs.length))).toBe(0);
    expect(readdirSync(trips).sort()).toEqual(["index.json", "list.json"]);
  });
});
